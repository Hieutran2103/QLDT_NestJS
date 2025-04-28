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
  // Check  user in topic?
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
      await this.checkUserInTopicOrThrow(userId, topicId);

      if (!createReportDto.fileUrl) {
        throw new BadRequestException('Missing uploaded file URL.');
      }

      // Transaction
      return await this.prisma.$transaction(
        async (tx) => {
          // create report
          const report = await tx.report.create({
            data: {
              topicId,
              userId,
              description: createReportDto.description || '',
              filename: createReportDto.fileUrl,
              status: 0,
            },
          });

          // get info topic
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

          // get info user
          const creator = await tx.user.findUnique({
            where: { id: userId },
            include: {
              role: true,
            },
          });

          if (!creator) {
            throw new NotFoundException('User not found');
          }

          // send email
          await this.sendReportNotificationEmails(
            topic,
            creator,
            userId,
            createReportDto,
          );

          // Delete cache
          await this.deleteCacheByPrefix(KeyReport.REPORT);

          return report;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 10000,
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

      // get info user
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

      // if not admin, check user in topic
      if (!isAdmin) {
        await this.checkUserInTopicOrThrow(userId, topicId);
      }

      //  transaction

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

      // save cache
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

          // find report
          const report = await tx.report.findUnique({
            where: { id },
            include: { topic: true },
          });

          if (!report) {
            throw new NotFoundException('Report not found.');
          }

          // check user in topic
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

          // teachers can edit everything if they are participating in the topic
          if (user.role.name === RoleEnum.TEACHER) {
            // edit report
            const updatedReport = await tx.report.update({
              where: { id },
              data: updateReportDto,
            });
            // delete cache
            await this.deleteCacheByPrefix(KeyReport.REPORT);
            return updatedReport;
          }

          // students can only edit if they are the owner of the report.
          if (user.role.name === RoleEnum.STUDENT) {
            if (report.userId !== userId) {
              throw new ForbiddenException(
                'You are not allowed to edit this report.',
              );
            }

            // students cannot edit the status.
            if ('status' in updateReportDto) {
              throw new ForbiddenException(
                'You are not allowed to change the report status.',
              );
            }

            // just edit the filename and description.
            const { filename, description } = updateReportDto;

            // Cập nhật report trong transaction
            const updatedReport = await tx.report.update({
              where: { id },
              data: {
                filename,
                description,
              },
            });
            // delete cache
            await this.deleteCacheByPrefix(KeyReport.REPORT);
            return updatedReport;
          }

          // if not  student or teacher
          throw new ForbiddenException(
            'You do not have permission to update reports.',
          );
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 5000,
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
      // Transaction
      return await this.prisma.$transaction(
        async (tx) => {
          // get in4 user
          const user = await tx.user.findUnique({
            where: { id: userId },
            include: { role: true },
          });

          if (!user) {
            throw new ForbiddenException('User does not exist.');
          }

          const report = await tx.report.findUnique({
            where: { id },
          });

          if (!report) {
            throw new NotFoundException('Report not found.');
          }

          // check user in topic
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

          // Teachers can delete all reports if they are participating in the topic.
          if (user.role.name === RoleEnum.TEACHER) {
            await tx.report.delete({ where: { id } });

            await this.deleteCacheByPrefix(KeyReport.REPORT);

            return { message: 'Report deleted successfully.' };
          }

          // Students can only delete their own reports.
          if (user.role.name === RoleEnum.STUDENT) {
            if (report.userId !== userId) {
              throw new ForbiddenException(
                'You are not allowed to delete this report.',
              );
            }

            await tx.report.delete({ where: { id } });

            await this.deleteCacheByPrefix(KeyReport.REPORT);

            return { message: 'Report deleted successfully.' };
          }

          throw new ForbiddenException(
            'You do not have permission to delete reports.',
          );
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 5000,
        },
      );
    } catch (error) {
      //Error transaction
      if (error.code === 'P2034') {
        throw new BadRequestException('Transaction timeout.');
      }
      throw new BadRequestException(error.message);
    }
  }
}
