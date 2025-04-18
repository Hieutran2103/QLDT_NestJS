import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from 'src/shared/services/prisma.service';

@Injectable()
export class RoleService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    try {
      // Kiểm tra nếu tên role đã tồn tại
      const existingRole = await this.prismaService.role.findFirst({
        where: { name: createRoleDto.name },
      });

      if (existingRole) {
        throw new BadRequestException('Role name already exists');
      }

      // Tạo role mới
      return await this.prismaService.role.create({
        data: createRoleDto,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create role: ' + error.message);
    }
  }

  async findAll() {
    try {
      return await this.prismaService.role.findMany();
    } catch (error) {
      throw new BadRequestException('Failed to fetch roles: ' + error.message);
    }
  }

  async findOne(id: string) {
    try {
      const role = await this.prismaService.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Biến đổi dữ liệu để trả về danh sách permissions
      const permissions = role.rolePermissions.map((rp) => rp.permission);

      return {
        ...role,
        permissions,
        rolePermissions: undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch role: ' + error.message);
    }
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    try {
      // Kiểm tra role tồn tại
      const role = await this.prismaService.role.findUnique({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Kiểm tra tên role mới đã tồn tại chưa (nếu đang cập nhật tên)
      if (updateRoleDto.name && updateRoleDto.name !== role.name) {
        const existingRole = await this.prismaService.role.findFirst({
          where: {
            name: updateRoleDto.name,
            id: { not: id },
          },
        });

        if (existingRole) {
          throw new BadRequestException('Role name already exists');
        }
      }

      // Cập nhật role
      return await this.prismaService.role.update({
        where: { id },
        data: updateRoleDto,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to update role: ' + error.message);
    }
  }

  async remove(id: string) {
    try {
      // Kiểm tra role tồn tại
      const role = await this.prismaService.role.findUnique({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Kiểm tra xem role có đang được sử dụng bởi user nào không
      const usersWithRole = await this.prismaService.user.count({
        where: { roleId: id },
      });

      if (usersWithRole > 0) {
        throw new BadRequestException(
          'Cannot delete role as it is assigned to users',
        );
      }

      // Xóa các rolePermission
      await this.prismaService.rolePermission.deleteMany({
        where: { roleId: id },
      });

      // Xóa role
      return await this.prismaService.role.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to delete role: ' + error.message);
    }
  }

  async assignPermissions(roleId: string, permissionIds: string[]) {
    try {
      // Kiểm tra role tồn tại
      const role = await this.prismaService.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Kiểm tra các permission tồn tại
      const permissions = await this.prismaService.permission.findMany({
        where: { id: { in: permissionIds } },
      });

      if (permissions.length !== permissionIds.length) {
        throw new BadRequestException('One or more permissions not found');
      }

      // Sử dụng transaction để đảm bảo tính nhất quán
      return await this.prismaService.$transaction(async (tx) => {
        // Lấy các rolePermission hiện tại
        const existingRolePermissions = await tx.rolePermission.findMany({
          where: { roleId },
          select: { permissionId: true },
        });
        const existingPermissionIds = existingRolePermissions.map(
          (rp) => rp.permissionId,
        );

        // Chỉ thêm những permission chưa có
        const newPermissionIds = permissionIds.filter(
          (id) => !existingPermissionIds.includes(id),
        );

        // Tạo các rolePermission mới
        if (newPermissionIds.length > 0) {
          const rolePermissions = newPermissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          }));

          await tx.rolePermission.createMany({
            data: rolePermissions,
          });
        }

        // Trả về role với danh sách permissions đã cập nhật
        return this.findOne(roleId);
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to assign permissions: ' + error.message,
      );
    }
  }

  async removePermissions(roleId: string, permissionIds: string[]) {
    try {
      // Kiểm tra role tồn tại
      const role = await this.prismaService.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Kiểm tra các permission tồn tại
      const permissions = await this.prismaService.permission.findMany({
        where: { id: { in: permissionIds } },
      });

      if (permissions.length !== permissionIds.length) {
        throw new BadRequestException('One or more permissions not found');
      }

      // Sử dụng transaction để đảm bảo tính nhất quán
      return await this.prismaService.$transaction(async (tx) => {
        // Xóa các rolePermission được chỉ định
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
            permissionId: { in: permissionIds },
          },
        });

        // Trả về role với danh sách permissions đã cập nhật
        return this.findOne(roleId);
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to remove permissions: ' + error.message,
      );
    }
  }
}
