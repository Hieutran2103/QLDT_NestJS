export class CreateAuthDto {}

import { Exclude } from 'class-transformer';
import { Match } from 'src/shared/decorators/custom-validator.decorator';

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LoginBodyDTO {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @MinLength(6)
  @Match('password')
  confirmPassword: string;
}

export class RegisterUserDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
  @IsNotEmpty()
  @IsString()
  name: string;
  @IsNotEmpty()
  @IsString()
  roleId: string; // ID của role ('admin', 'teacher', 'student')
}

export class RegisterResDTO {
  email: string;
  name: string;
  @Exclude() password: string;
  createdAt: Date;
  updatedAt: Date;

  roleId: string;
  // Dùng Partial<T> để hỗ trợ truyền object không đầy đủ
  // Sử dụng Object.assign(this, partial) để gán dữ liệu nhanh chóng
  constructor(partial: Partial<RegisterResDTO>) {
    Object.assign(this, partial);
  }
}

export class LoginResDTO {
  accessToken: string;
  constructor(partial: Partial<LoginResDTO>) {
    Object.assign(this, partial);
  }
}

//Excell

export class RegisterExcelDto extends RegisterUserDto {}

export class BulkRegisterDto {
  @ValidateNested({ each: true })
  @Type(() => RegisterExcelDto)
  users: RegisterExcelDto[];
}
