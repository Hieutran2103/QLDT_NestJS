import { Module } from '@nestjs/common';
import { S3Module as NestS3Module } from 'nestjs-s3';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

@Module({
  imports: [
    NestS3Module.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey = configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        );

        if (!accessKeyId || !secretAccessKey) {
          throw new Error('AWS credentials are not properly configured.');
        }
        return {
          config: {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
            region: configService.get<string>('AWS_REGION'),
            endpoint: configService.get<string>('AWS_ENDPOINT'),
            forcePathStyle: false,
            signatureVersion: 'v4',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
