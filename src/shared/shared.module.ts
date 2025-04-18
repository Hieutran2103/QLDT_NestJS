import { Global, Module } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';
import { S3Module } from './s3/s3.module';
import { CacheModule } from '@nestjs/cache-manager';
import { MailModule } from './mail/mail.module';
import * as redisStore from 'cache-manager-ioredis';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService, S3Module, MailModule],
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore as any,
      host: 'localhost',
      port: 6379,
      ttl: 600,
    }),
    S3Module,
    MailModule,
  ],
})
export class SharedModule {}
