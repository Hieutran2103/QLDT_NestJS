import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { ReportService } from './report.service';
import {
  CreateReportDto,
  FindAllReportsDto,
  UpdateReportDto,
} from './dto/report.dto';

import { Auth } from 'src/shared/decorators/auth.decorator';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/shared/constants/auth-constant';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.reportService.uploadFile(file);
  }

  @Auth('create_report_in_topic')
  @Post(':topicId')
  create(
    @Body() createReportDto: CreateReportDto,
    @Param('topicId') topicId: string,
    @Req() request: Request,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    console.log(userId);
    return this.reportService.create(userId, topicId, createReportDto);
  }

  @Auth('get_report_in_topic')
  @Get(':topicId')
  findAll(
    @Param('topicId') topicId: string,
    @Req() request: Request,
    @Query() query: FindAllReportsDto,
  ) {
    const userId = request[REQUEST_USER_KEY].id as string;
    return this.reportService.findAll(topicId, userId, query);
  }

  @Auth('edit_report_in_topic')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() updateReportDto: UpdateReportDto,
  ) {
    const userId = req[REQUEST_USER_KEY].id as string;
    return this.reportService.update(id, userId, updateReportDto);
  }

  @Auth('delete_report_in_topic')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const userId = req[REQUEST_USER_KEY].id as string;
    return this.reportService.remove(id, userId);
  }
}
