import { Module } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { TokenModule } from 'src/shared/token/token.module';

@Module({
  controllers: [CommentController],
  providers: [CommentService],
  imports: [TokenModule],
})
export class CommentModule {}
