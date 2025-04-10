/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateReportDto,
  FindAllReportsDto,
  UpdateReportDto,
} from './dto/report.dto';

import { PrismaService } from 'src/shared/services/prisma.service';
import { S3Service } from 'src/shared/s3/s3.service';
import { Prisma } from '@prisma/client';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { RoleEnum } from 'src/shared/constants/role-constant';
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
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

      const report = await this.prisma.report.create({
        data: {
          topicId,
          userId,
          description: createReportDto.description || '',
          filename: createReportDto.fileUrl,
          status: 0,
        },
      });

      // await this.deleteCacheByPrefix(`report:${topicId}`);

      return report;
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to create report.',
      );
    }
  }

  async findAll(topicId: string, userId: string, query: FindAllReportsDto) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new ForbiddenException('User does not exist.');
    }

    const isAdmin = user.role.name === RoleEnum.ADMIN;

    const whereCondition: Prisma.ReportWhereInput = {
      topicId,
      ...(status !== undefined ? { status: Number(status) } : {}),
    };

    // const cacheKey = `report:${topicId}:${userId}:${user.role.name}:${page}:${limit}:${status || ''}`;

    // const cached = await this.cacheManager.get(cacheKey);
    // if (cached) {
    //   console.log(' Returning reports from cache');
    //   return cached;
    // }

    // Nếu không phải admin, phải check tham gia topic
    if (!isAdmin) {
      await this.checkUserInTopicOrThrow(userId, topicId);
    }

    const [reports, totalItems] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.report.count({ where: whereCondition }),
    ]);

    const totalPage = Math.ceil(totalItems / limit);

    const result = {
      data: reports,
      totalPage,
      currentPage: page,
      pageSize: limit,
      totalItems,
    };

    // await this.cacheManager.set(cacheKey, result, 60 * 1); // cache 1p

    return result;
  }

  async update(id: string, userId: string, updateReportDto: UpdateReportDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) {
        throw new ForbiddenException('User does not exist.');
      }

      const report = await this.prisma.report.findUnique({
        where: { id },
        include: { topic: true },
      });

      if (!report) {
        throw new NotFoundException('Report not found.');
      }

      // Kiểm tra xem user có tham gia topic không
      await this.checkUserInTopicOrThrow(userId, report.topicId);

      // Giáo viên được sửa tất cả nếu có tham gia topic
      if (user.role.name === RoleEnum.TEACHER) {
        // Kiểm tra xem giáo viên có tham gia topic không

        return this.prisma.report.update({
          where: { id },
          data: updateReportDto,
        });
      }

      // Sinh viên chỉ được sửa nếu là chủ report
      if (user.role.name === RoleEnum.STUDENT) {
        // Kiểm tra xem sinh viên có tham gia topic không

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
        return this.prisma.report.update({
          where: { id },
          data: {
            filename,
            description,
          },
        });
      }
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async remove(id: string, userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) {
        throw new ForbiddenException('User does not exist.');
      }

      const report = await this.prisma.report.findUnique({
        where: { id },
      });

      if (!report) {
        throw new NotFoundException('Report not found.');
      }

      // Kiểm tra xem user có tham gia topic không
      await this.checkUserInTopicOrThrow(userId, report.topicId);

      // Giáo viên được xóa tất cả report nếu có tham gia topic
      if (user.role.name === RoleEnum.TEACHER) {
        await this.prisma.report.delete({ where: { id } });
        return { message: 'Report deleted successfully.' };
      }

      // Sinh viên chỉ được xóa report của mình
      if (user.role.name === RoleEnum.STUDENT) {
        if (report.userId !== userId) {
          throw new ForbiddenException(
            'You are not allowed to delete this report.',
          );
        }

        await this.prisma.report.delete({ where: { id } });
        return { message: 'Report deleted successfully.' };
      }
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
