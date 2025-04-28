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

  private async addStudentsToTopic(topicId: string, studentIds: string[]) {
    const topicUsersData = studentIds.map((studentId) => ({
      topicId,
      userId: studentId,
    }));

    await this.prismaService.topicUser.createMany({
      data: topicUsersData,
    });
  }

  async create(
    createTopicDto: CreateTopicDto,
    creatorId: string,
    creatorRoleId: string,
  ) {
    try {
      const { name, description, teacherId, studentIds } = createTopicDto;

      // Check for duplicate topic names (case-insensitive)
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

      // If the user is an admin, ensure there is a teacherId and verify that the teacher exists.
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

      //Check if the studentIds are valid.
      const students = await this.prismaService.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true },
      });

      if (students.length !== studentIds.length) {
        throw new BadRequestException('One or more student IDs are invalid');
      }

      // create topic
      const newTopic = await this.prismaService.topic.create({
        data: {
          name,
          description,
          creatorId,
          teacherId: roleName === RoleEnum.ADMIN ? teacherId : creatorId,
        },
      });

      // add creator/teacher and students to the topic
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

      // create a cache key based on all the search parameters.
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

      // check cache
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        console.log('Returning topics from cache');
        return cached;
      }

      // Build the search conditions.
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

      // add a search condition based on status.
      if (status) {
        whereCondition.status = status;
      }

      // add a search condition based on the score range
      if (minScore !== undefined || maxScore !== undefined) {
        whereCondition.score = {};

        if (minScore !== undefined) {
          whereCondition.score.gte = minScore;
        }

        if (maxScore !== undefined) {
          whereCondition.score.lte = maxScore;
        }
      }

      // add a search condition based on the time range.
      if (startDate || endDate) {
        whereCondition.createdAt = {};

        if (startDate) {
          // greater than or equal
          whereCondition.createdAt.gte = new Date(startDate);
        }

        if (endDate) {
          // Set the end time to the end of the day.
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

      // set cache
      await this.cacheManager.set(cacheKey, result, 60000 * 10); // 10 minutes

      return result;
    } catch (error) {
      throw new BadRequestException('Error fetching topics: ' + error.message);
    }
  }

  async findOneTopic(id: string, userId: string, roleId: string) {
    try {
      // get in4 role of user
      const userRole = await this.prismaService.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });

      if (!userRole) {
        throw new BadRequestException('Invalid user role');
      }

      // check topic exist
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

      // Check access based on role
      // Admin: Can view all topics
      // Teacher: Can only view topics they are participating in
      // Student: Can only view topics they are participating in

      if (userRole.name !== RoleEnum.ADMIN) {
        // check user in topic
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

      // Get list of participants excluding teachers
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

      //  return the topic details and list of participants
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

      // create cache key
      const cacheKey = `${KeyTopic.ENROLLED_TOPIC}:${JSON.stringify({
        page,
        limit,
        search,
        status,
        minScore,
        maxScore,
        startDate,
        endDate,
      })}`;

      // check cache
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        console.log('Returning enrolled topics from cache');
        return cached;
      }

      // Get the list of topicIds that the user has participated in.
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

      // Build the search conditions.
      const whereCondition: any = {
        id: { in: topicIds },
        name: search
          ? {
              contains: search,
              mode: Prisma.QueryMode.insensitive, // Search case-insensitive.
            }
          : undefined,
      };

      if (status) {
        whereCondition.status = status;
      }

      if (minScore !== undefined || maxScore !== undefined) {
        whereCondition.score = {};

        if (minScore !== undefined) {
          whereCondition.score.gte = minScore;
        }

        if (maxScore !== undefined) {
          whereCondition.score.lte = maxScore;
        }
      }

      if (startDate || endDate) {
        whereCondition.createdAt = {};

        if (startDate) {
          whereCondition.createdAt.gte = new Date(startDate);
        }

        if (endDate) {
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
          orderBy: { createdAt: 'desc' }, // Sort by the most recent creation date.
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

      // set cache
      await this.cacheManager.set(cacheKey, result, 50000);

      return result;
    } catch (error) {
      throw new BadRequestException(
        'Error fetching enrolled topics: ' + error.message,
      );
    }
  }

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

      // Transaction

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

          // Only update name/description/teacherId if provided.
          const updateData: any = {};
          if (name && name !== topic.name) {
            // Check for duplicate topic names.
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

          // When scoring, automatically set status to 'done' and action to 'close'.
          if (score !== undefined) {
            // Check if the current user is the teacher of this topic.
            if (topic.teacherId !== userId) {
              throw new BadRequestException(
                'Only the teacher of this topic can set a score',
              );
            }

            updateData.score = score;
            updateData.status = 'done';
            updateData.action = 'close';
          }

          // If the status is updated to done, a score must be provided
          if (status === 'done') {
            // Check if a score exists
            if (score === undefined && (topic as any).score === 0) {
              throw new BadRequestException(
                'Cannot set status to done without a score',
              );
            }
            updateData.status = status;
          } else if (status !== undefined) {
            // If the status is not 'done', update normally.
            updateData.status = status;
          }

          //Allow setting action to 'close' even without a score.
          if (action !== undefined) {
            updateData.action = action;
          }

          // Update topic information.
          const updatedTopic = await tx.topic.update({
            where: { id: topicId },
            data: updateData,
          });

          // Handle updating the list of students if provided.
          if (Array.isArray(studentIds)) {
            // Get the current list of students (excluding teachers)
            const currentUsers = await tx.topicUser.findMany({
              where: { topicId },
            });

            // Get the current list of students
            const currentStudentIds = currentUsers
              .filter((u) => u.userId !== topic.teacherId)
              .map((u) => u.userId);

            // Identify the list of students to add and remove
            const toAdd = studentIds.filter(
              (id) => !currentStudentIds.includes(id),
            );
            const toRemove = currentStudentIds.filter(
              (id) => !studentIds.includes(id),
            );

            // Remove students no longer in the list.
            if (toRemove.length > 0) {
              await tx.topicUser.deleteMany({
                where: {
                  topicId,
                  userId: { in: toRemove },
                },
              });
            }

            // Add new students to the topic.
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

          // Handle updating the teacher if there are changes
          if (teacherId && teacherId !== topic.teacherId) {
            // Remove the old teacher from the topic.
            if (topic.teacherId) {
              await tx.topicUser.deleteMany({
                where: { topicId, userId: topic.teacherId },
              });
            }

            // Add the new teacher to the topic.
            await tx.topicUser.create({
              data: {
                topicId,
                userId: teacherId,
              },
            });
          }

          // delete cache
          await this.deleteCacheByPrefix(KeyTopic.ENROLLED_TOPIC);
          await this.deleteCacheByPrefix(KeyTopic.TOPIC);

          return updatedTopic;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000, // 10 sec
        },
      );
    } catch (error) {
      // error transaction
      if (error.code === 'P2034') {
        throw new BadRequestException(
          'Transaction timeout - too many concurrent updates.',
        );
      }

      throw new BadRequestException('Error updating topic: ' + error.message);
    }
  }

  async remove(id: string) {
    try {
      // transaction
      return await this.prismaService.$transaction(
        async (tx) => {
          //  check topic exist
          const topic = await tx.topic.findUnique({
            where: { id },
            include: {
              reports: { select: { id: true } },
            },
          });

          if (!topic) {
            throw new NotFoundException('Topic not found');
          }

          // Delete the topic_user associations.
          await tx.topicUser.deleteMany({
            where: { topicId: id },
          });

          // Delete the reports belonging to this topic.
          if (topic.reports.length > 0) {
            await tx.report.deleteMany({
              where: { topicId: id },
            });
          }

          //  delete topic
          await tx.topic.delete({
            where: { id },
          });

          //  delete cache
          await this.deleteCacheByPrefix(`enrolled_topics:`);
          await this.deleteCacheByPrefix('topic:');

          return { message: 'Topic deleted successfully' };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 5000, // 5 sec
        },
      );
    } catch (error) {
      // error transaction
      if (error.code === 'P2034') {
        throw new BadRequestException('Transaction timeout.');
      }
      throw new BadRequestException('Error deleting topic: ' + error.message);
    }
  }
}
