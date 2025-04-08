import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

import {
  RegisterUserDto,
  RegisterResDTO,
  LoginBodyDTO,
  LoginResDTO,
} from './dto';

import { removeFile } from 'src/utils/multer.config';
import { Auth } from 'src/shared/decorators/auth.decorator';
import { UploadFileInterceptor } from 'src/shared/decorators/upload-file.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  async login(@Body() loginUserDto: LoginBodyDTO) {
    return new LoginResDTO(await this.authService.login(loginUserDto));
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
      throw new BadRequestException('Vui lòng upload file Excel');
    }

    const filePath = file.path;

    try {
      const users = this.authService.parseExcel(filePath);
      return this.authService.registerManyUser(users);
    } finally {
      removeFile(filePath);
    }
  }

  @Auth('get_all_user')
  @Get('')
  getAllUser() {
    return this.authService.getAllUsers();
  }
}
