import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { multerConfig } from 'src/shared/utils/multer.config';

export function UploadFileInterceptor() {
  return UseInterceptors(FileInterceptor('file', multerConfig));
}
