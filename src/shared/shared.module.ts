import { Global, Module } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';
import { S3Module } from './s3/s3.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService, S3Module],
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore as any,
      host: 'localhost',
      port: 6379,
      ttl: 600,
    }),
    S3Module,
  ],
})
export class SharedModule {}
