/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
export class CreateReportDto {
  @IsNotEmpty()
  @IsString()
  description?: string;
  @IsNotEmpty()
  @IsString()
  fileUrl: string;
}

export class FindAllReportsDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page: number = 1;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit: number = 10;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2]) // 0: pending, 1: đạt, 2: không đạt
  status?: number;
}
