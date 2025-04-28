import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';

import { RegisterUserDto, RegisterResDTO, LoginBodyDTO } from './dtos';

import { removeFile } from 'src/shared/utils/multer.config';
import { Auth } from 'src/shared/decorators/auth.decorator';
import { UploadFileInterceptor } from 'src/shared/decorators/upload-file.decorator';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  async login(@Body() loginUserDto: LoginBodyDTO) {
    return this.authService.login(loginUserDto);
  }

  @Auth('create_user')
  @Post('/register')
  async register(@Body() createUserDto: RegisterUserDto) {
    return new RegisterResDTO(
      await this.authService.registerUser(createUserDto),
    );
  }

  @Auth('create_many_user')
  @Post('/register/bulk')
  @UploadFileInterceptor()
  async registerMany(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Please upload file Excel');
    }

    const filePath = file.path;

    try {
      const users = this.authService.parseExcel(filePath);
      return await this.authService.registerManyUser(users);
    } finally {
      removeFile(filePath);
    }
  }

  @Auth('create_many_user')
  @Get('/register/bulk/template')
  getRegisterBulkTemplate(@Res() res: Response) {
    // Đường dẫn đến file template
    const templatePath = 'template_import_user/import_user.xlsx';

    // Gửi file trực tiếp
    res.sendFile(templatePath, { root: './' });
    return { message: 'File template sent successfully' };
  }

  @Auth('get_all_user')
  @Get('')
  getAllUser() {
    return this.authService.getAllUsers();
  }
}
