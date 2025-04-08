import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/auth.decorator';
import { REQUEST_USER_KEY } from '../constants/auth-constant';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request[REQUEST_USER_KEY];

    if (!user) {
      throw new ForbiddenException(' you are not authenticated');
    }

    // Lấy tất cả permission của user dựa vào role_id
    const permissions = await this.prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      include: { permission: true },
    });

    const userPermissions = permissions.map((rp) => rp.permission.name);

    // Kiểm tra xem user có quyền không
    if (!userPermissions.includes(requiredPermission)) {
      throw new ForbiddenException('You do not have permission');
    }

    return true;
  }
}
