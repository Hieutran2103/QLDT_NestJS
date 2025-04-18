import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PrismaService } from 'src/shared/services/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createPermissionDto: CreatePermissionDto) {
    try {
      // Kiểm tra nếu tên permission đã tồn tại
      const existingPermission = await this.prismaService.permission.findFirst({
        where: { name: createPermissionDto.name },
      });

      if (existingPermission) {
        throw new BadRequestException('Permission name already exists');
      }

      // Tạo permission mới
      return await this.prismaService.permission.create({
        data: createPermissionDto,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to create permission: ' + error.message,
      );
    }
  }

  async findAll() {
    try {
      return await this.prismaService.permission.findMany();
    } catch (error) {
      throw new BadRequestException(
        'Failed to fetch permissions: ' + error.message,
      );
    }
  }

  async findOne(id: string) {
    try {
      const permission = await this.prismaService.permission.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Biến đổi dữ liệu để trả về danh sách roles có quyền này
      const roles = permission.rolePermissions.map((rp) => rp.role);

      return {
        ...permission,
        roles,
        rolePermissions: undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to fetch permission: ' + error.message,
      );
    }
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    try {
      // Kiểm tra permission tồn tại
      const permission = await this.prismaService.permission.findUnique({
        where: { id },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Kiểm tra tên permission mới đã tồn tại chưa (nếu đang cập nhật tên)
      if (
        updatePermissionDto.name &&
        updatePermissionDto.name !== permission.name
      ) {
        const existingPermission =
          await this.prismaService.permission.findFirst({
            where: {
              name: updatePermissionDto.name,
              id: { not: id },
            },
          });

        if (existingPermission) {
          throw new BadRequestException('Permission name already exists');
        }
      }

      // Cập nhật permission
      return await this.prismaService.permission.update({
        where: { id },
        data: updatePermissionDto,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to update permission: ' + error.message,
      );
    }
  }

  async remove(id: string) {
    try {
      // Kiểm tra permission tồn tại
      const permission = await this.prismaService.permission.findUnique({
        where: { id },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Kiểm tra xem permission có đang được sử dụng bởi role nào không
      const rolePermissions = await this.prismaService.rolePermission.count({
        where: { permissionId: id },
      });

      if (rolePermissions > 0) {
        throw new BadRequestException(
          'Cannot delete permission as it is assigned to roles',
        );
      }

      // Xóa permission
      return await this.prismaService.permission.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to delete permission: ' + error.message,
      );
    }
  }
}
