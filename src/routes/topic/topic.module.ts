import { Module } from '@nestjs/common';
// import { CacheModule } from '@nestjs/cache-manager';

import { TopicService } from './topic.service';
import { TopicController } from './topic.controller';
import { TokenModule } from 'src/shared/token/token.module';
import { CacheModule } from '@nestjs/cache-manager';

import * as redisStore from 'cache-manager-redis-store';

@Module({
  controllers: [TopicController],
  providers: [TopicService],
  imports: [
    TokenModule,
    CacheModule.register({
      store: redisStore,
      host: 'localhost',
      port: 6379,
      auth_pass: '123456',
      ttl: 50000,
    }),
  ],
})
export class TopicModule {}
