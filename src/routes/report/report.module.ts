import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TokenModule } from 'src/shared/token/token.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  controllers: [ReportController],
  providers: [ReportService],
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
export class ReportModule {}
