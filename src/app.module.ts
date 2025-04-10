import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './routes/auth/auth.module';
import { CommentModule } from './routes/comment/comment.module';
import { ReportModule } from './routes/report/report.module';
import { TopicModule } from './routes/topic/topic.module';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: path.resolve(
        __dirname,
        '..',
        'shared',
        'configs',
        '.env-dev',
      ),
      isGlobal: true,
    }),
    SharedModule,
    AuthModule,
    CommentModule,
    ReportModule,
    TopicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule {}
