/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateCommentDto,
  UpdateCommentDto,
  UpdateCommentStatusDto,
} from './dtos';
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
    topicId: string,
    userId: string,
    createCommentDto: CreateCommentDto,
  ) {
    // Tìm thông tin topic
    const topic = (await this.prisma.topic.findUnique({
      where: { id: topicId },
    })) as any;

    if (!topic) throw new NotFoundException('Topic not found.');

    // Kiểm tra xem topic đã đóng chưa
    if (topic.action === 'close') {
      throw new ForbiddenException('Cannot create comment in a closed topic');
    }

    // Kiểm tra người dùng có tham gia topic không
    await this.checkUserInTopicOrThrow(userId, topicId);

    // Trích xuất dữ liệu
    const { content, parentId } = createCommentDto;
    let parentCommentId: string | null = null;

    // Xử lý trường hợp trả lời comment nếu có parentId
    if (parentId) {
      // Kiểm tra parent comment có tồn tại không và thuộc topic hiện tại
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }

      if (parentComment.topicId !== topicId) {
        throw new BadRequestException(
          'Parent comment does not belong to this topic',
        );
      }

      parentCommentId = parentId;
    }

    // Tạo comment mới (hoặc reply)
    return this.prisma.comment.create({
      data: {
        content,
        topicId,
        userId,
        parentId: parentCommentId,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(
    commentId: string,
    userId: string,
    updateStatusDto: UpdateCommentStatusDto,
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { topic: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }

    // không cho tự sửa status của bản thân
    if (comment.userId === userId) {
      throw new ForbiddenException(
        'You cannot update the status of your own comment.',
      );
    }

    // kiểm tra xem user có trong topic không
    await this.checkUserInTopicOrThrow(userId, comment.topicId);

    return this.prisma.comment.update({
      where: { id: commentId },
      data: {
        status: updateStatusDto.status,
      },
    });
  }

  async findAll(topicId: string, userId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
    });
    if (!topic) {
      throw new NotFoundException('Topic not found.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new ForbiddenException('User not found.');
    }

    const isAdmin = user.role.name === RoleEnum.ADMIN;

    if (!isAdmin) {
      await this.checkUserInTopicOrThrow(userId, topicId);
    }

    return this.prisma.comment.findMany({
      where: { topicId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true } },
        replies: {
          select: {
            id: true,
            content: true,
            status: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
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
      // chỉ cho sửa comment của bản thân
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
