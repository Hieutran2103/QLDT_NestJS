// import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { ROLES_KEY } from '../decorators/roles.decorator';
// import { REQUEST_USER_KEY } from '../constants/auth-constant';
// import { PrismaService } from '../services/prisma.service';

// @Injectable()
// export class RolesGuard implements CanActivate {
//   constructor(
//     private reflector: Reflector,
//     private prisma: PrismaService,
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const requiredRoles = this.reflector.get<string[]>(
//       ROLES_KEY,
//       context.getHandler(),
//     );

//     if (!requiredRoles) {
//       return true;
//     }

//     const request = context.switchToHttp().getRequest();
//     const user = request[REQUEST_USER_KEY];

//     // Kiểm tra vai trò của người dùng trong DB
//     const userRole = await this.prisma.user.findUnique({
//       where: { id: user.id },
//       include: { role: true },
//     });

//     return userRole?.role?.name
//       ? requiredRoles.includes(userRole.role.name)
//       : false;
//   }
// }
