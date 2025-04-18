import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import {
  CreateCommentDto,
  UpdateCommentDto,
  UpdateCommentStatusDto,
} from './dtos';
import { Auth } from 'src/shared/decorators/auth.decorator';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/shared/constants/auth-constant';

@Controller('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Auth('create_comment')
  @Post('/:topicId')
  create(
    @Param('topicId') topicId: string,
    @Req() request: Request,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.create(topicId, userId, createCommentDto);
  }

  @Auth('edit_comment')
  @Patch('/status/:commentId')
  updateStatus(
    @Param('commentId') commentId: string,
    @Body() updateStatusDto: UpdateCommentStatusDto,
    @Req() request: Request,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.updateStatus(commentId, userId, updateStatusDto);
  }

  @Auth('get_comment')
  @Get('/:topicId')
  findAll(@Param('topicId') topicId: string, @Req() request: Request) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.findAll(topicId, userId);
  }

  @Auth('edit_comment')
  @Patch(':commentId')
  update(
    @Param('commentId') commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Req() request: Request,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.update(commentId, updateCommentDto, userId);
  }

  @Auth('delete_comment')
  @Delete(':commentId')
  remove(@Param('commentId') commentId: string, @Req() request: Request) {
    const userId = request[REQUEST_USER_KEY].id as string;

    return this.commentService.remove(commentId, userId);
  }
}
