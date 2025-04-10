/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCommentDto, UpdateCommentDto } from './dto/create-comment.dto';
import { PrismaService } from 'src/shared/services/prisma.service';
import { RoleEnum } from 'src/shared/constants/role-constant';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(
    reportId: string,
    userId: string,
    createCommentDto: CreateCommentDto,
  ) {
    try {
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new NotFoundException('Report not found.');
      }

      await this.checkUserInTopicOrThrow(userId, report.topicId);

      return this.prisma.comment.create({
        data: {
          content: createCommentDto.content,
          reportId,
          userId,
        },
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async findAll(reportId: string, userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user) {
        throw new ForbiddenException('User does not exist.');
      }

      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
        include: { topic: true },
      });

      if (!report) {
        throw new NotFoundException('Report not found.');
      }

      const isAdmin = user.role.name === RoleEnum.ADMIN;

      if (!isAdmin) {
        await this.checkUserInTopicOrThrow(userId, report.topicId);
      }

      return this.prisma.comment.findMany({
        where: { reportId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async update(
    commentId: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
  ) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        throw new NotFoundException('Comment not found.');
      }

      if (comment.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to edit this comment.',
        );
      }

      return this.prisma.comment.update({
        where: { id: commentId },
        data: {
          content: updateCommentDto.content,
        },
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async remove(commentId: string, userId: string) {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        throw new NotFoundException('Comment not found.');
      }

      if (comment.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to delete this comment.',
        );
      }

      await this.prisma.comment.delete({
        where: { id: commentId },
      });

      return { message: 'Comment deleted successfully.' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
