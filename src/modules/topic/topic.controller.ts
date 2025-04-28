/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
} from '@nestjs/common';
import { TopicService } from './topic.service';
import {
  CreateTopicDto,
  FindAllTopicsDto,
  FindAllTopicsEnRolledDto,
  UpdateTopicDto,
} from './dtos';

import { Auth } from 'src/shared/decorators/auth.decorator';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/shared/constants/auth-constant';

@Controller('topic')
export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  @Auth('create_topic')
  @Post()
  create(@Body() createTopicDto: CreateTopicDto, @Req() request: Request) {
    const { id, roleId } = request[REQUEST_USER_KEY];
    return this.topicService.create(createTopicDto, id, roleId);
  }

  @Auth('get_all_topic')
  @Get('/get_all_topic')
  async findAll(@Query() query: FindAllTopicsDto) {
    return this.topicService.findAll(query);
  }

  @Auth('get_all_topics_enrolled')
  @Get('/get_all_topic_enrolled')
  findTopicEnrolled(
    @Query() query: FindAllTopicsEnRolledDto,
    @Req() request: Request,
  ) {
    const { id } = request[REQUEST_USER_KEY];

    return this.topicService.findAllTopicsEnrolled(id, query);
  }

  @Auth('get_topic_by_id')
  @Get('/:id')
  async findOneTopic(@Param('id') id: string, @Req() request: Request) {
    const { id: userId, roleId } = request[REQUEST_USER_KEY];

    return this.topicService.findOneTopic(id, userId, roleId);
  }

  @Auth('edit_topic')
  @Patch('/:id')
  update(
    @Param('id') id: string,
    @Body() updateTopicDto: UpdateTopicDto,
    @Req() request: Request,
  ) {
    const { id: userId } = request[REQUEST_USER_KEY];
    return this.topicService.editTopic(id, updateTopicDto, userId);
  }

  @Auth('delete_topic')
  @Delete('/:id')
  remove(@Param('id') id: string) {
    return this.topicService.remove(id);
  }
}
