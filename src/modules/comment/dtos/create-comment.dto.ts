// dto/create-comment.dto.ts
import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommentDto {
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  parentId?: string;
}

export class UpdateCommentDto extends CreateCommentDto {}

export class UpdateCommentStatusDto {
  @IsEnum([0, 1], {
    message: 'Status must be either 0 (unresolved) or 1 (resolved)',
  })
  status: number;
}
