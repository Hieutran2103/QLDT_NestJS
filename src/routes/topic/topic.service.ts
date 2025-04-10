/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateTopicDto,
  FindAllTopicsDto,
  FindAllTopicsEnRolledDto,
  UpdateTopicDto,
} from './dto/create-topic.dto';

import { PrismaService } from 'src/shared/services/prisma.service';
import { Prisma } from '@prisma/client';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { RoleEnum } from 'src/shared/constants/role-constant';

@Injectable()
export class TopicService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  //  xóa tất cả các cache có prefix là prefix được truyền vào
  private async deleteCacheByPrefix(prefix: string) {
    const keys: string[] = await (this.cacheManager.stores as any).keys(
      `${prefix}*`,
    );
    if (keys.length) {
      await (this.cacheManager.stores as any).del(keys);
    }
  }

  // cập nhật sinh viên trong topic
  private async updateStudentsInTopic(
    topicId: string,
    teacherId: string | null,
    newStudentIds: string[],
  ) {
    const currentUsers = await this.prismaService.topicUser.findMany({
      where: { topicId },
    });

    const currentStudentIds = currentUsers
      .filter((u) => u.userId !== teacherId)
      .map((u) => u.userId);

    const toAdd = newStudentIds.filter((id) => !currentStudentIds.includes(id));

    const toRemove = currentStudentIds.filter(
      (id) => !newStudentIds.includes(id),
    );

    if (toAdd.length > 0) {
      const newStudents = await this.prismaService.user.findMany({
        where: { id: { in: toAdd } },
        select: { id: true, roleId: true },
      });

      if (newStudents.length !== toAdd.length) {
        throw new BadRequestException('Some student IDs are invalid');
      }

      await this.addStudentsToTopic(topicId, newStudents);
    }

    if (toRemove.length > 0) {
      await this.prismaService.topicUser.deleteMany({
        where: { topicId, userId: { in: toRemove } },
      });
    }
  }
  // cập nhật giáo viên trong topic
  private async updateTeacherInTopic(
    topicId: string,
    oldTeacherId: string | null,
    newTeacherId: string | undefined,
  ) {
    if (!newTeacherId || newTeacherId === oldTeacherId) return;

    if (oldTeacherId) {
      await this.prismaService.topicUser.deleteMany({
        where: { topicId, userId: oldTeacherId },
      });
    }

    await this.addUserToTopic(topicId, newTeacherId);
  }
  // kiểm tra xem topic có tồn tại không
  private async getTopicOrFail(topicId: string) {
    const topic = await this.prismaService.topic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new BadRequestException('Topic not found');
    return topic;
  }

  // kiểm tra xem tên topic có duy nhất không
  private async ensureUniqueName(name: string, excludeTopicId: string) {
    const exists = await this.prismaService.topic.findFirst({
      where: { name, id: { not: excludeTopicId } },
    });
    if (exists) throw new BadRequestException('Topic name already exists');
  }

  //  thêm người vào topic với roleId từ user
  private async addUserToTopic(topicId: string, userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { roleId: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.prismaService.topicUser.create({
      data: {
        topicId,
        userId,
        roleId: user.roleId, // Gán roleId từ user vào topic_users
      },
    });
  }

  //  thêm sinh viên vào topic
  private async addStudentsToTopic(
    topicId: string,
    students: { id: string; roleId: string }[],
  ) {
    const topicUsersData = students.map((student) => ({
      topicId,
      userId: student.id,
      roleId: student.roleId, // Gán roleId từ user vào topic_users
    }));

    await this.prismaService.topicUser.createMany({
      data: topicUsersData,
    });
  }

  // tạo topic mới
  async create(
    createTopicDto: CreateTopicDto,
    creatorId: string,
    creatorRoleId: string,
  ) {
    try {
      const { name, description, teacherId, studentIds } = createTopicDto;

      // Kiểm tra trùng tên topic không phân biệt hoa thường
      const existingTopic = await this.prismaService.topic.findFirst({
        where: { name }, //
      });

      // Kiểm tra xem tên topic đã tồn tại chưa
      if (existingTopic) {
        throw new BadRequestException('Topic name must be unique');
      }

      // Kiểm tra xem creatorRoleId có hợp lệ không
      if (!creatorRoleId) {
        throw new BadRequestException('Creator role ID is missing');
      }

      // Tìm thông tin về role dựa trên creatorRoleId
      const creatorRole = await this.prismaService.role.findUnique({
        where: { id: creatorRoleId },
        select: { name: true },
      });

      if (!creatorRole) {
        throw new BadRequestException('Invalid roleId for the creator');
      }

      const roleName = creatorRole.name;

      // Kiểm tra xem teacherId có hợp lệ không (nếu là admin)
      if (roleName === RoleEnum.ADMIN) {
        if (!teacherId) {
          throw new BadRequestException(
            'Teacher ID must be provided for admin',
          );
        }

        // Kiểm tra xem teacherId có hợp lệ không
        const teacher = await this.prismaService.user.findUnique({
          where: { id: teacherId },
          select: { roleId: true },
        });

        if (!teacher) {
          throw new BadRequestException('Teacher not found');
        }
      }

      // Kiểm tra xem studentIds có hợp lệ không
      const students = await this.prismaService.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, roleId: true },
      });
      if (students.length !== studentIds.length) {
        throw new BadRequestException('One or more student IDs are invalid');
      }

      // Tạo topic mới
      const newTopic = await this.prismaService.topic.create({
        data: {
          name,
          description,
          creatorId,
          teacherId: roleName === 'admin' ? teacherId : creatorId, // Nếu admin thì dùng teacherId, nếu là giáo viên thì tự động dùng creatorId
        },
      });

      await Promise.all([
        // Gán người tạo (creator hoặc teacher) vào topic
        this.addUserToTopic(
          newTopic.id,
          (roleName === 'admin' ? teacherId : creatorId) as string,
        ),
        // Thêm sinh viên vào topic
        this.addStudentsToTopic(newTopic.id, students),
        // Xóa cache liên quan đến topic
        this.deleteCacheByPrefix(`enrolled_topics:`),
        this.deleteCacheByPrefix('topic:'),
      ]);

      return newTopic;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  //  lấy tất cả các topic
  async findAll(query: FindAllTopicsDto) {
    try {
      const { page = 1, limit = 10, search, creatorId, teacherId } = query;
      const skip = (page - 1) * limit;

      // Tạo cache key duy nhất
      const cacheKey = `topic:${page}:${limit}:${search || ''}:${creatorId || ''}:${teacherId || ''}`;

      // Kiểm tra cache
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        // console.log(' Returning topics from Redis cache');
        return cached;
      }

      // Điều kiện tìm kiếm
      const whereCondition: Prisma.TopicWhereInput = {
        name: search
          ? {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            }
          : undefined,
        creatorId: creatorId || undefined,
        teacherId: teacherId || undefined,
      };

      const [topics, totalItems] = await this.prismaService.$transaction([
        this.prismaService.topic.findMany({
          skip,
          take: limit,
          where: whereCondition,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            creator: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        }),
        this.prismaService.topic.count({
          where: whereCondition,
        }),
      ]);

      const totalPage = Math.ceil(totalItems / limit);

      const result = {
        data: topics,
        totalPage,
        currentPage: page,
        pageSize: limit,
        totalItems,
      };

      // Lưu vào Redis cache
      await this.cacheManager.set(cacheKey, result, 60 * 10); // cache trong 10 phút

      return result;
    } catch (error) {
      throw new BadRequestException('Error fetching topics: ' + error.message);
    }
  }

  // lấy tất cả các topic mà user đã tham gia
  async findAllTopicsEnrolled(userId: string, query: FindAllTopicsEnRolledDto) {
    try {
      const { page = 1, limit = 10, search = '' } = query;
      const skip = (page - 1) * limit;

      const cacheKey = `enrolled_topics:${userId}:${page}:${limit}:${search}`;
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        // console.log('Returning enrolled topics from cache');
        return cached;
      }

      // 1. Lấy danh sách topicId mà user đã tham gia
      const topicUserList = await this.prismaService.topicUser.findMany({
        where: { userId },
        select: { topicId: true },
      });

      const topicIds = topicUserList.map((item) => item.topicId);

      if (topicIds.length === 0) {
        return {
          data: [],
          totalPage: 0,
          currentPage: page,
          pageSize: limit,
          totalItems: 0,
        };
      }

      const whereCondition: Prisma.TopicWhereInput = {
        id: { in: topicIds },
        name: search
          ? {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            }
          : undefined,
      };

      const [topics, totalItems] = await this.prismaService.$transaction([
        this.prismaService.topic.findMany({
          skip,
          take: limit,
          where: whereCondition,
          orderBy: { createdAt: 'desc' },
          include: {
            creator: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        }),
        this.prismaService.topic.count({
          where: whereCondition,
        }),
      ]);

      const totalPage = Math.ceil(totalItems / limit);

      const result = {
        data: topics,
        totalPage,
        currentPage: page,
        pageSize: limit,
        totalItems,
      };

      await this.cacheManager.set(cacheKey, result, 60 * 10); // cache 10 phút

      return result;
    } catch (error) {
      throw new BadRequestException(
        'Error fetching enrolled topics: ' + error.message,
      );
    }
  }

  // cập nhật topic
  async editTopic(topicId: string, updateDto: UpdateTopicDto) {
    try {
      const { name, description, teacherId, studentIds } = updateDto;

      const topic = await this.getTopicOrFail(topicId);

      // Chỉ cập nhật name/description/teacherId nếu được truyền vào
      const updateData: any = {};
      if (name && name !== topic.name) {
        await this.ensureUniqueName(name, topicId);
        updateData.name = name;
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      if (teacherId && teacherId !== topic.teacherId) {
        updateData.teacherId = teacherId;
      }

      const updatedTopic = await this.prismaService.topic.update({
        where: { id: topicId },
        data: updateData,
      });

      // Chỉ xử lý nếu studentIds được truyền vào
      if (Array.isArray(studentIds)) {
        await this.updateStudentsInTopic(topicId, topic.teacherId, studentIds);
      }

      // Chỉ xử lý nếu teacherId được truyền vào và khác với cũ
      if (teacherId && teacherId !== topic.teacherId) {
        await this.updateTeacherInTopic(topicId, topic.teacherId, teacherId);
      }

      await Promise.all([
        this.deleteCacheByPrefix(`enrolled_topics:`),
        this.deleteCacheByPrefix('topic:'),
      ]);

      return updatedTopic;
    } catch (error) {
      throw new BadRequestException(
        'Error fetching enrolled topics: ' + error.message,
      );
    }
  }

  // xóa topic
  async remove(id: string) {
    try {
      // 1. Kiểm tra topic tồn tại
      const topic = await this.prismaService.topic.findUnique({
        where: { id },
        // include: {
        //   topicUsers: { select: { userId: true } }, // Lấy danh sách user đã join topic
        // },
      });

      // console.log(topic);
      if (!topic) {
        throw new NotFoundException('Topic not found');
      }

      //Xoá topic_user trước
      await this.prismaService.topicUser.deleteMany({
        where: { topicId: id },
      });

      await Promise.all([
        //  Xoá topic
        await this.prismaService.topic.delete({
          where: { id },
        }),
        // xóa cache
        this.deleteCacheByPrefix(`enrolled_topics:`),
        this.deleteCacheByPrefix('topic:'),
      ]);

      return { message: 'Topic deleted successfully' };
    } catch (error) {
      throw new BadRequestException('Error deleting topic: ' + error.message);
    }
  }
}
