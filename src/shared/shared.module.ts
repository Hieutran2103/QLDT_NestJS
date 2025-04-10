import { Global, Module } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';
import { S3Module } from './s3/s3.module';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService, S3Module],
  imports: [S3Module],
})
export class SharedModule {}
