import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
// import { PrismaService } from 'src/shared/services/prisma.service';
import { TokenModule } from 'src/shared/token/token.module';
@Module({
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
  imports: [TokenModule],
})
export class PermissionModule {}
