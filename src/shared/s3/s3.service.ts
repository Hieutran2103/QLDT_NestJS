import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectS3, S3 } from 'nestjs-s3';
import { ManagedUpload } from 'aws-sdk/clients/s3';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';

@Injectable()
export class S3Service {
  private allowedMimeTypes = [
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ];

  constructor(
    @InjectS3() private readonly s3: S3,
    private readonly configService: ConfigService,
  ) {}

  async uploadFile(file: Express.Multer.File): Promise<ManagedUpload.SendData> {
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only .doc, .docx, and .pdf files are allowed',
      );
    }

    const bucket = this.configService.get<string>('AWS_BUCKET_NAME');
    const fileExt = extname(file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;

    const uploadResult = await this.s3
      .upload({
        Bucket: bucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    return uploadResult;
  }
}
