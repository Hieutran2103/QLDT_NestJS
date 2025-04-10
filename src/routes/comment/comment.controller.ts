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
import { CreateCommentDto, UpdateCommentDto } from './dto/create-comment.dto';
import { Auth } from 'src/shared/decorators/auth.decorator';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/shared/constants/auth-constant';

@Controller('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}
  // comment.controller.ts

  @Auth('create_comment')
  @Post('/:reportId')
  create(
    @Param('reportId') reportId: string,
    @Req() request: Request,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.create(reportId, userId, createCommentDto);
  }

  @Auth('get_comment')
  @Get('/:reportId')
  findAll(@Param('reportId') reportId: string, @Req() request: Request) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.commentService.findAll(reportId, userId);
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
