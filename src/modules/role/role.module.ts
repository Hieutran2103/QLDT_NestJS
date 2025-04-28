import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
// import { PrismaService } from 'src/shared/services/prisma.service';
import { TokenModule } from 'src/shared/token/token.module';
@Module({
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
  imports: [TokenModule],
})
export class RoleModule {}
