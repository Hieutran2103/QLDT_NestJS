import { Global, Module } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';
import { S3Module } from './s3/s3.module';
import { CacheModule } from '@nestjs/cache-manager';
import { MailModule } from './mail/mail.module';
import * as redisStore from 'cache-manager-ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService, S3Module, MailModule, CacheModule],
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: redisStore as any,
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        ttl: configService.get<number>('REDIS_TTL'),
      }),
      inject: [ConfigService],
    }),
    S3Module,
    MailModule,
  ],
})
export class SharedModule {}
