/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  IsNotEmpty,
  IsString,
  IsArray,
  ArrayMinSize,
  IsInt,
  IsOptional,
  Min,
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

  @IsString()
  teacherId?: string;
}

export class FindAllTopicsDto {
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
  creatorId: string = '';

  @IsString()
  @IsOptional()
  teacherId: string = '';
}
export class FindAllTopicsEnRolledDto extends FindAllTopicsDto {}

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
}
