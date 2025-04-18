/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  IsNotEmpty,
  IsString,
  IsArray,
  ArrayMinSize,
  IsInt,
  IsOptional,
  Min,
  IsNumber,
  IsIn,
  Max,
} from 'class-validator';
import { NormalizeTopicName } from 'src/shared/decorators/normalizeTopicName.decorator';
import { Transform } from 'class-transformer';
export class CreateTopicDto {
  @IsNotEmpty()
  @IsString()
  @NormalizeTopicName() // chuẩn hóa tên topic
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  studentIds: string[];

  @IsOptional()
  @IsString()
  teacherId?: string;
}

export class FindAllTopicsEnRolledDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page: number = 1; // Default page is 1

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit: number = 10; // Default limit is 10

  @IsString()
  @IsOptional()
  search: string = '';

  @IsString()
  @IsOptional()
  @IsIn(['inprocess', 'done', ''])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  minScore?: number;

  @IsOptional()
  @IsNumber()
  @Max(10)
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  maxScore?: number;

  @IsOptional()
  // @IsString()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: string;

  @IsOptional()
  // @IsString()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: string;
}

export class FindAllTopicsDto extends FindAllTopicsEnRolledDto {
  @IsString()
  @IsOptional()
  creatorId: string = '';

  @IsString()
  @IsOptional()
  teacherId: string = '';
}

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  score?: number;

  @IsOptional()
  @IsString()
  @IsIn(['inprocess', 'done'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['open', 'close'])
  action?: string;
}
