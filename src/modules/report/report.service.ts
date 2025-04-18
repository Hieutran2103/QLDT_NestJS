/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateReportDto, FindAllReportsDto, UpdateReportDto } from './dtos';

import { PrismaService } from 'src/shared/services/prisma.service';
import { S3Service } from 'src/shared/s3/s3.service';
import { Prisma } from '@prisma/client';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { RoleEnum } from 'src/shared/constants/role-constant';
import { KeyReport } from 'src/shared/constants/key-cache.constant';
import { MailService } from 'src/shared/services/mail.service';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async deleteCacheByPrefix(prefix: string) {
    const keys: string[] = await (this.cacheManager.stores as any).keys(
      `${prefix}*`,
    );
    if (keys.length) {
      await (this.cacheManager.stores as any).del(keys);
    }
  }
  // Check xem user có tham gia topic hay không
  private async checkUserInTopicOrThrow(userId: string, topicId: string) {
    const topicUser = await this.prisma.topicUser.findUnique({
      where: {
        topicId_userId: {
          topicId,
          userId,
        },
      },
    });

    if (!topicUser) {
      throw new ForbiddenException('You are not a participant of this topic.');
    }
  }

  async uploadFile(file: Express.Multer.File) {
    return this.s3Service.uploadFile(file);
  }

  private async sendReportNotificationEmails(
    topic: {
      id: string;
      name: string;
      topicUsers: { userId: string; user: { email: string } }[];
    },
    creator: { name: string; role: { name: string } },
    userId: string,
    createReportDto: CreateReportDto,
  ) {
    const emailPromises = topic.topicUsers
      .filter((tu) => tu.userId !== userId)
      .map((tu) => {
        const creatorRole =
          creator.role.name === RoleEnum.TEACHER ? 'Teacher' : 'Student';
        const html = `
          <h2>New Report Notification</h2>
          <p>A new report has been created in topic "${topic.name}"</p>
          <p>Created by: ${creator.name} (${creatorRole})</p>
          <p>Description: ${createReportDto.description || 'No description provided'}</p>
          <p>File: ${createReportDto.fileUrl}</p>
        `;
        return this.mailService.addMailToQueue(
          creator.name,
          tu.user.email,
          `New Report in ${topic.name} by ${creator.name} (${creatorRole})`,
          html,
        );
      });

    await Promise.all(emailPromises);
  }

  async create(
    userId: string,
    topicId: string,
    createReportDto: CreateReportDto,
  ) {
    try {
      // Kiểm tra trước khi bắt đầu transaction
      await this.checkUserInTopicOrThrow(userId, topicId);

      if (!createReportDto.fileUrl) {
        throw new BadRequestException('Missing uploaded file URL.');
      }

      // Sử dụng transaction để đảm bảo tất cả các thao tác đều thành công hoặc thất bại cùng nhau
      return await this.prisma.$transaction(
        async (tx) => {
          // Tạo report trong transaction
          const report = await tx.report.create({
            data: {
              topicId,
              userId,
              description: createReportDto.description || '',
              filename: createReportDto.fileUrl,
              status: 0,
            },
          });

          // Lấy thông tin topic trong transaction
          const topic = (await tx.topic.findUnique({
            where: { id: topicId },
            include: {
              topicUsers: {
                include: {
                  user: true,
                },
              },
            },
          })) as any;

          if (!topic) {
            throw new NotFoundException('Topic not found');
          }

          if (topic.action === 'close') {
            throw new ForbiddenException(
              'Cannot create new report in a closed topic',
            );
          }

          // Lấy thông tin người tạo report
          const creator = await tx.user.findUnique({
            where: { id: userId },
            include: {
              role: true,
            },
          });

          if (!creator) {
            throw new NotFoundException('User not found');
          }

          // Gửi email thông báo - nằm ngoài transaction vì không liên quan đến DB
          await this.sendReportNotificationEmails(
            topic,
            creator,
            userId,
            createReportDto,
          );

          // Xóa cache
          await this.deleteCacheByPrefix(KeyReport.REPORT);

          return report;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 10000, // 10 giây
        },
      );
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to create report.',
      );
    }
  }

  async findAll(topicId: string, userId: string, query: FindAllReportsDto) {
    try {
      const { page = 1, limit = 10, status } = query;
      const skip = (page - 1) * limit;

      // Lấy thông tin user trước khi bắt đầu transaction
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) {
        throw new ForbiddenException('User does not exist.');
      }

      const isAdmin = user.role.name === RoleEnum.ADMIN;

      // Kiểm tra cache theo logic gốc
      const cached = (await this.cacheManager.get(KeyReport.REPORT)) as {
        currentPage?: number;
      };
      if (cached && cached.currentPage !== undefined) {
        if (page !== cached.currentPage) {
          await this.deleteCacheByPrefix(KeyReport.REPORT);
        } else {
          console.log('Returning topics from cache');
          return cached;
        }
      }

      // Nếu không phải admin, phải check tham gia topic
      if (!isAdmin) {
        await this.checkUserInTopicOrThrow(userId, topicId);
      }

      // Sử dụng transaction để đảm bảo tính nhất quán khi đọc dữ liệu
      // Điều này giúp tránh các vấn đề khi dữ liệu đang được thay đổi bởi request khác
      const [reports, totalItems] = await this.prisma.$transaction(
        [
          this.prisma.report.findMany({
            where: {
              topicId,
              ...(status !== undefined ? { status: Number(status) } : {}),
            },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { name: true, email: true } },
            },
          }),
          this.prisma.report.count({
            where: {
              topicId,
              ...(status !== undefined ? { status: Number(status) } : {}),
            },
          }),
        ],
        {
          // Sử dụng mức cô lập ReadCommitted phù hợp cho truy vấn chỉ đọc
          // ReadCommitted cho phép đọc dữ liệu đã được commit và không bị khóa bởi transaction khác
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      const totalPage = Math.ceil(totalItems / limit);

      const result = {
        data: reports,
        totalPage,
        currentPage: page,
        pageSize: limit,
        totalItems,
      };

      // Lưu vào cache theo logic gốc
      await this.cacheManager.set(KeyReport.REPORT, result, 50000);

      return result;
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to fetch reports.',
      );
    }
  }

  async update(id: string, userId: string, updateReportDto: UpdateReportDto) {
    try {
      // Sử dụng transaction với isolation level là Serializable để ngăn chặn race condition
      // Serializable đảm bảo các transaction không bị ảnh hưởng bởi các transaction khác đang chạy
      return await this.prisma.$transaction(
        async (tx) => {
          // Lấy thông tin user
          const user = await tx.user.findUnique({
            where: { id: userId },
            include: { role: true },
          });

          if (!user) {
            throw new ForbiddenException('User does not exist.');
          }

          // Tìm report - với transaction này sẽ tạo ra lock ngầm định cho bản ghi
          // ngăn chặn các thao tác update đồng thời từ người dùng khác
          const report = await tx.report.findUnique({
            where: { id },
            include: { topic: true },
          });

          if (!report) {
            throw new NotFoundException('Report not found.');
          }

          // Kiểm tra xem user có tham gia topic không
          const topicUser = await tx.topicUser.findUnique({
            where: {
              topicId_userId: {
                topicId: report.topicId,
                userId,
              },
            },
          });

          if (!topicUser) {
            throw new ForbiddenException(
              'You are not a participant of this topic.',
            );
          }

          // Giáo viên được sửa tất cả nếu có tham gia topic
          if (user.role.name === RoleEnum.TEACHER) {
            // Xóa cache trước
            await this.deleteCacheByPrefix(KeyReport.REPORT);

            // Cập nhật report trong transaction
            const updatedReport = await tx.report.update({
              where: { id },
              data: updateReportDto,
            });

            return updatedReport;
          }

          // Sinh viên chỉ được sửa nếu là chủ report
          if (user.role.name === RoleEnum.STUDENT) {
            if (report.userId !== userId) {
              throw new ForbiddenException(
                'You are not allowed to edit this report.',
              );
            }

            // Không cho sinh viên sửa status
            if ('status' in updateReportDto) {
              throw new ForbiddenException(
                'You are not allowed to change the report status.',
              );
            }

            // Chỉ cho phép sửa filename và description
            const { filename, description } = updateReportDto;

            // Xóa cache trước
            await this.deleteCacheByPrefix(KeyReport.REPORT);

            // Cập nhật report trong transaction
            const updatedReport = await tx.report.update({
              where: { id },
              data: {
                filename,
                description,
              },
            });

            return updatedReport;
          }

          // Nếu không phải giáo viên hoặc sinh viên
          throw new ForbiddenException(
            'You do not have permission to update reports.',
          );
        },
        {
          // Mức cô lập Serializable đảm bảo tính nhất quán cao nhất
          // nhưng có thể gây ra lỗi khi có nhiều người cùng cập nhật
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 5000, // 5 giây
        },
      );
    } catch (error) {
      // Xử lý lỗi khi transaction timeout hoặc deadlock
      if (error.code === 'P2034') {
        throw new BadRequestException(
          'Transaction timeout - too many concurrent updates.',
        );
      }
      throw new BadRequestException(error.message);
    }
  }

  async remove(id: string, userId: string) {
    try {
      // Sử dụng transaction để đảm bảo tính nhất quán khi xóa report
      return await this.prisma.$transaction(
        async (tx) => {
          // Lấy thông tin user
          const user = await tx.user.findUnique({
            where: { id: userId },
            include: { role: true },
          });

          if (!user) {
            throw new ForbiddenException('User does not exist.');
          }

          // Tìm report để xóa - lock ngầm định sẽ được tạo ra
          // ngăn chặn các thao tác khác trên report này
          const report = await tx.report.findUnique({
            where: { id },
          });

          if (!report) {
            throw new NotFoundException('Report not found.');
          }

          // Kiểm tra xem user có tham gia topic không
          const topicUser = await tx.topicUser.findUnique({
            where: {
              topicId_userId: {
                topicId: report.topicId,
                userId,
              },
            },
          });

          if (!topicUser) {
            throw new ForbiddenException(
              'You are not a participant of this topic.',
            );
          }

          // Giáo viên được xóa tất cả report nếu có tham gia topic
          if (user.role.name === RoleEnum.TEACHER) {
            // Xóa report
            await tx.report.delete({ where: { id } });

            // Xóa cache sau khi xóa report
            await this.deleteCacheByPrefix(KeyReport.REPORT);

            return { message: 'Report deleted successfully.' };
          }

          // Sinh viên chỉ được xóa report của mình
          if (user.role.name === RoleEnum.STUDENT) {
            if (report.userId !== userId) {
              throw new ForbiddenException(
                'You are not allowed to delete this report.',
              );
            }

            // Xóa report
            await tx.report.delete({ where: { id } });

            // Xóa cache sau khi xóa report
            await this.deleteCacheByPrefix(KeyReport.REPORT);

            return { message: 'Report deleted successfully.' };
          }

          // Nếu không phải giáo viên hoặc sinh viên
          throw new ForbiddenException(
            'You do not have permission to delete reports.',
          );
        },
        {
          // Mức cô lập RepeatableRead đủ cho việc xóa dữ liệu
          // nó đảm bảo dữ liệu được đọc không bị thay đổi bởi các transaction khác
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 5000, // 5 giây
        },
      );
    } catch (error) {
      // Xử lý lỗi transaction
      if (error.code === 'P2034') {
        throw new BadRequestException('Transaction timeout.');
      }
      throw new BadRequestException(error.message);
    }
  }
}
