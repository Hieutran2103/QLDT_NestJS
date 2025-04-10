// dto/create-comment.dto.ts
import { IsNotEmpty } from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty()
  content: string;
}

export class UpdateCommentDto extends CreateCommentDto {}
