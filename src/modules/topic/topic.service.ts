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
} from './dtos';

import { PrismaService } from 'src/shared/services/prisma.service';
import { Prisma } from '@prisma/client';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { RoleEnum } from 'src/shared/constants/role-constant';
import { KeyTopic } from 'src/shared/constants/key-cache.constant';

@Injectable()
export class TopicService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  //  xóa tất cả các cache có prefix là prefix được truyền vào
  private async deleteCacheByPrefix(prefix: string) {
    try {
      // Lấy Keyv store từ cache manager (là phần tử đầu tiên của mảng stores)
      const keyvStore = this.cacheManager.stores[0] as any;
      if (!keyvStore || !keyvStore._store) {
        console.log('Cache store not available');
        return;
      }

      // Duyệt qua các key và xóa những key có prefix phù hợp
      const keysToDelete = [];
      for (const key of keyvStore._store.keys()) {
        // Đối với Keyv, key có format "keyv:actualKey"
        if (key.startsWith(`keyv:${prefix}:`)) {
          keysToDelete.push(key as never);
        }
      }

      // Xóa từng key tìm được
      for (const key of keysToDelete) {
        await keyvStore._store.delete(key);
      }

      console.log(
        `Deleted ${keysToDelete.length} cache entries with prefix ${prefix}`,
      );
    } catch (error) {
      console.error('Error deleting cache by prefix:', error);
    }
  }

  //  thêm người vào topic với roleId từ user
  private async addUserToTopic(topicId: string, userId: string) {
    const userExists = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      throw new BadRequestException('User not found');
    }

    await this.prismaService.topicUser.create({
      data: {
        topicId,
        userId,
      },
    });
  }

  //  thêm sinh viên vào topic
  private async addStudentsToTopic(topicId: string, studentIds: string[]) {
    const topicUsersData = studentIds.map((studentId) => ({
      topicId,
      userId: studentId,
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

      // Kiểm tra trùng tên topic (không phân biệt hoa thường)
      const existingTopic = await this.prismaService.topic.findFirst({
        where: { name },
      });

      if (existingTopic) {
        throw new BadRequestException('Topic name must be unique');
      }

      if (!creatorRoleId) {
        throw new BadRequestException('Creator role ID is missing');
      }

      const creatorRole = await this.prismaService.role.findUnique({
        where: { id: creatorRoleId },
        select: { name: true },
      });

      if (!creatorRole) {
        throw new BadRequestException('Invalid roleId for the creator');
      }

      const roleName = creatorRole.name;

      // Nếu là admin thì cần có teacherId và kiểm tra teacher tồn tại
      if (roleName === RoleEnum.ADMIN) {
        if (!teacherId) {
          throw new BadRequestException(
            'Teacher ID must be provided for admin',
          );
        }

        const teacherExists = await this.prismaService.user.findUnique({
          where: { id: teacherId },
          select: { id: true },
        });

        if (!teacherExists) {
          throw new BadRequestException('Teacher not found');
        }
      }

      // Kiểm tra xem studentIds có hợp lệ không
      const students = await this.prismaService.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true },
      });

      if (students.length !== studentIds.length) {
        throw new BadRequestException('One or more student IDs are invalid');
      }

      // Tạo topic
      const newTopic = await this.prismaService.topic.create({
        data: {
          name,
          description,
          creatorId,
          teacherId: roleName === RoleEnum.ADMIN ? teacherId : creatorId,
        },
      });

      // Thêm creator/teacher và students vào topic
      await Promise.all([
        this.addUserToTopic(
          newTopic.id,
          roleName === RoleEnum.ADMIN ? (teacherId as string) : creatorId,
        ),
        this.addStudentsToTopic(
          newTopic.id,
          students.map((s) => s.id),
        ),
        this.deleteCacheByPrefix(KeyTopic.TOPIC),
        this.deleteCacheByPrefix(KeyTopic.ENROLLED_TOPIC),
      ]);

      return newTopic;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  //  lấy tất cả các topic
  async findAll(query: FindAllTopicsDto) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        creatorId,
        teacherId,
        status,
        minScore,
        maxScore,
        startDate,
        endDate,
      } = query;
      const skip = (page - 1) * limit;

      // Tạo cache key dựa trên tất cả các tham số tìm kiếm
      const cacheKey = `${KeyTopic.TOPIC}:${JSON.stringify({
        page,
        limit,
        search,
        creatorId,
        teacherId,
        status,
        minScore,
        maxScore,
        startDate,
        endDate,
      })}`;

      // Kiểm tra cache với key cụ thể
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        console.log('Returning topics from cache');
        return cached;
      }

      // Xây dựng các điều kiện tìm kiếm
      const whereCondition: any = {
        name: search
          ? {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            }
          : undefined,
        creatorId: creatorId || undefined,
        teacherId: teacherId || undefined,
      };

      // Thêm điều kiện tìm kiếm theo status
      if (status) {
        whereCondition.status = status;
      }

      // Thêm điều kiện tìm kiếm theo khoảng score
      if (minScore !== undefined || maxScore !== undefined) {
        whereCondition.score = {};

        if (minScore !== undefined) {
          whereCondition.score.gte = minScore;
        }

        if (maxScore !== undefined) {
          whereCondition.score.lte = maxScore;
        }
      }

      // Thêm điều kiện tìm kiếm theo khoảng thời gian
      if (startDate || endDate) {
        whereCondition.createdAt = {};

        if (startDate) {
          // đặt thời gian bắt đầu là vào đầu ngày
          // greater than or equal
          whereCondition.createdAt.gte = new Date(startDate);
        }

        if (endDate) {
          // đặt thời gian kết thúc là vào cuối ngày
          // less than or equal
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59);
          whereCondition.createdAt.lte = endDateTime;
        }
      }

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

      // Lưu vào Redis cache với key cụ thể
      await this.cacheManager.set(cacheKey, result, 50000);

      return result;
    } catch (error) {
      throw new BadRequestException('Error fetching topics: ' + error.message);
    }
  }

  async findOneTopic(id: string, userId: string, roleId: string) {
    try {
      // Lấy thông tin vai trò của người dùng
      const userRole = await this.prismaService.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });

      if (!userRole) {
        throw new BadRequestException('Invalid user role');
      }

      // Kiểm tra xem topic có tồn tại không
      const topic = await this.prismaService.topic.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          teacher: { select: { id: true, name: true, email: true } },
        },
      });

      if (!topic) {
        throw new NotFoundException('Topic not found');
      }

      // Kiểm tra quyền truy cập dựa trên vai trò
      // Admin: Có thể xem tất cả các topic
      // Giáo viên: Chỉ xem được topic mà họ tham gia
      // Sinh viên: Chỉ xem được topic mà họ tham gia
      if (userRole.name !== RoleEnum.ADMIN) {
        // Kiểm tra xem người dùng có tham gia topic không
        const isUserInTopic = await this.prismaService.topicUser.findFirst({
          where: {
            topicId: id,
            userId,
          },
        });

        if (!isUserInTopic) {
          throw new BadRequestException('You do not have access to this topic');
        }
      }

      // Lấy danh sách người tham gia (không bao gồm giáo viên)
      const topicUsers = await this.prismaService.topicUser.findMany({
        where: {
          topicId: id,
          userId: topic.teacherId ? { not: topic.teacherId } : undefined,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      const students = topicUsers.map((tu) => tu.user);

      // Trả về thông tin chi tiết topic và danh sách người tham gia
      return {
        ...topic,
        students,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error fetching topic: ' + error.message);
    }
  }

  // lấy tất cả các topic mà user đã tham gia
  async findAllTopicsEnrolled(userId: string, query: FindAllTopicsEnRolledDto) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status,
        minScore,
        maxScore,
        startDate,
        endDate,
      } = query;
      const skip = (page - 1) * limit;

      // Tạo cache key dựa trên tất cả các tham số tìm kiếm và userId
      const cacheKey = `${KeyTopic.ENROLLED_TOPIC}:${userId}:${JSON.stringify({
        page,
        limit,
        search,
        status,
        minScore,
        maxScore,
        startDate,
        endDate,
      })}`;

      // Kiểm tra cache với key cụ thể
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        console.log('Returning enrolled topics from cache');
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

      // Xây dựng các điều kiện tìm kiếm
      const whereCondition: any = {
        id: { in: topicIds },
        name: search
          ? {
              contains: search,
              mode: Prisma.QueryMode.insensitive, // Tìm kiếm không phân biệt chữ hoa chữ thường
            }
          : undefined,
      };

      // Thêm điều kiện tìm kiếm theo status
      if (status) {
        whereCondition.status = status;
      }

      // Thêm điều kiện tìm kiếm theo khoảng score
      if (minScore !== undefined || maxScore !== undefined) {
        whereCondition.score = {};

        if (minScore !== undefined) {
          whereCondition.score.gte = minScore;
        }

        if (maxScore !== undefined) {
          whereCondition.score.lte = maxScore;
        }
      }

      // Thêm điều kiện tìm kiếm theo khoảng thời gian
      if (startDate || endDate) {
        whereCondition.createdAt = {};

        if (startDate) {
          whereCondition.createdAt.gte = new Date(startDate);
        }

        if (endDate) {
          // Đặt thời gian kết thúc là cuối ngày
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          whereCondition.createdAt.lte = endDateTime;
        }
      }

      const [topics, totalItems] = await this.prismaService.$transaction([
        this.prismaService.topic.findMany({
          skip,
          take: limit,
          where: whereCondition,
          orderBy: { createdAt: 'desc' }, // Sắp xếp theo ngày tạo mới nhất
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

      // Lưu vào Redis cache với key cụ thể
      await this.cacheManager.set(cacheKey, result, 50000);

      return result;
    } catch (error) {
      throw new BadRequestException(
        'Error fetching enrolled topics: ' + error.message,
      );
    }
  }

  // cập nhật topic
  async editTopic(topicId: string, updateDto: UpdateTopicDto, userId: string) {
    try {
      const {
        name,
        description,
        teacherId,
        studentIds,
        score,
        status,
        action,
      } = updateDto;

      // Sử dụng transaction để đảm bảo tất cả thao tác cập nhật được xử lý như một đơn vị
      // Điều này tránh trường hợp một phần thành công, phần khác thất bại

      return await this.prismaService.$transaction(
        async (tx) => {
          const topic = await tx.topic.findUnique({
            where: { id: topicId },
            include: {
              teacher: true,
            },
          });

          if (!topic) {
            throw new BadRequestException('Topic not found');
          }

          // Chỉ cập nhật name/description/teacherId nếu được truyền vào
          const updateData: any = {};
          if (name && name !== topic.name) {
            // Kiểm tra trùng tên topic
            const existingTopic = await tx.topic.findFirst({
              where: {
                name,
                id: { not: topicId },
              },
            });

            if (existingTopic) {
              throw new BadRequestException('Topic name must be unique');
            }

            updateData.name = name;
          }

          if (description !== undefined) {
            updateData.description = description;
          }

          if (teacherId && teacherId !== topic.teacherId) {
            updateData.teacherId = teacherId;
          }

          // khi chấm điểm thì mình sẽ cho tự động status=done và action=close
          if (score !== undefined) {
            // Kiểm tra xem người dùng hiện tại có phải là giáo viên của topic này không
            if (topic.teacherId !== userId) {
              throw new BadRequestException(
                'Only the teacher of this topic can set a score',
              );
            }

            updateData.score = score;
            updateData.status = 'done';
            updateData.action = 'close';
          }

          // nếu status được cập nhật thành done thì cần có score không thì báo lỗi
          if (status === 'done') {
            // kiểm tra xem có score chưa (từ trước hoặc cập nhật hiện tại)
            if (score === undefined && (topic as any).score === 0) {
              throw new BadRequestException(
                'Cannot set status to done without a score',
              );
            }
            updateData.status = status;
          } else if (status !== undefined) {
            // Trường hợp status khác "done" thì cập nhật bình thường
            updateData.status = status;
          }

          //cho phép đặt action là close ngay cả khi không có score
          if (action !== undefined) {
            updateData.action = action;
          }

          // Cập nhật thông tin topic
          const updatedTopic = await tx.topic.update({
            where: { id: topicId },
            data: updateData,
          });

          // Xử lý cập nhật danh sách sinh viên nếu được cung cấp
          if (Array.isArray(studentIds)) {
            // Lấy danh sách user hiện tại trong topic
            const currentUsers = await tx.topicUser.findMany({
              where: { topicId },
            });

            // Lấy danh sách student hiện tại (bỏ qua teacher)
            const currentStudentIds = currentUsers
              .filter((u) => u.userId !== topic.teacherId)
              .map((u) => u.userId);

            // Xác định danh sách sinh viên cần thêm vào và xóa đi
            const toAdd = studentIds.filter(
              (id) => !currentStudentIds.includes(id),
            );
            const toRemove = currentStudentIds.filter(
              (id) => !studentIds.includes(id),
            );

            // Xóa sinh viên không còn trong danh sách
            if (toRemove.length > 0) {
              await tx.topicUser.deleteMany({
                where: {
                  topicId,
                  userId: { in: toRemove },
                },
              });
            }

            // Thêm sinh viên mới vào topic
            if (toAdd.length > 0) {
              const validStudents = await tx.user.findMany({
                where: { id: { in: toAdd } },
                select: { id: true },
              });

              if (validStudents.length !== toAdd.length) {
                throw new BadRequestException('Some student IDs are invalid');
              }

              await tx.topicUser.createMany({
                data: validStudents.map((s) => ({
                  topicId,
                  userId: s.id,
                })),
              });
            }
          }

          // Xử lý cập nhật giáo viên nếu có thay đổi
          if (teacherId && teacherId !== topic.teacherId) {
            // Xóa giáo viên cũ khỏi topic
            if (topic.teacherId) {
              await tx.topicUser.deleteMany({
                where: { topicId, userId: topic.teacherId },
              });
            }

            // Thêm giáo viên mới vào topic
            await tx.topicUser.create({
              data: {
                topicId,
                userId: teacherId,
              },
            });
          }

          // Xóa cache
          await this.deleteCacheByPrefix(KeyTopic.ENROLLED_TOPIC);
          await this.deleteCacheByPrefix(KeyTopic.TOPIC);

          return updatedTopic;
        },
        {
          // Sử dụng mức cô lập Serializable để đảm bảo tính nhất quán cao nhất
          // tránh các vấn đề khi nhiều người cùng cập nhật topic
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000, // 10 giây
        },
      );
    } catch (error) {
      // Xử lý lỗi transaction
      if (error.code === 'P2034') {
        throw new BadRequestException(
          'Transaction timeout - too many concurrent updates.',
        );
      }

      throw new BadRequestException('Error updating topic: ' + error.message);
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
