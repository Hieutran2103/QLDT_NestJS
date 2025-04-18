import { Module } from '@nestjs/common';

import { TopicService } from './topic.service';
import { TopicController } from './topic.controller';
import { TokenModule } from 'src/shared/token/token.module';

@Module({
  controllers: [TopicController],
  providers: [TopicService],

  imports: [TokenModule],
})
export class TopicModule {}
