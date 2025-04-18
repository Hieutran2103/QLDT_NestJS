/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prefer-const */
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as archiver from 'archiver';

const execPromise = promisify(exec);

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;

  private allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
      endpoint: this.configService.get<string>('AWS_ENDPOINT'),
      forcePathStyle: true,
    });
  }

  //  Làm sạch tên file để tránh lỗi Content-Disposition
  private sanitizeFilename(name: string): string {
    return name.replace(/[^\w\s.-]/gi, '_'); // Giữ lại chữ, số, _, -, ., khoảng trắng
  }

  private async compressPdf(inputBuffer: Buffer): Promise<Buffer> {
    const inputPath = path.join(__dirname, 'input.pdf');
    const outputPath = path.join(__dirname, 'output.pdf');

    fs.writeFileSync(inputPath, inputBuffer);

    try {
      await execPromise(
        `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${outputPath} ${inputPath}`,
      );
      const compressedBuffer = fs.readFileSync(outputPath);
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);

      console.log(
        `PDF compressed from ${(inputBuffer.length / 1024 / 1024).toFixed(
          2,
        )}MB to ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`,
      );

      return compressedBuffer;
    } catch (error) {
      console.error('PDF compression failed:', error);
      return inputBuffer;
    }
  }

  private async zipWordFile(file: Express.Multer.File): Promise<Buffer> {
    const zipPath = path.join(__dirname, 'temp-word.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise<Buffer>((resolve, reject) => {
      output.on('close', () => {
        const zippedBuffer = fs.readFileSync(zipPath);
        fs.unlinkSync(zipPath);

        console.log(
          `Word zipped from ${(file.buffer.length / 1024 / 1024).toFixed(
            2,
          )}MB to ${(zippedBuffer.length / 1024 / 1024).toFixed(2)}MB`,
        );

        resolve(zippedBuffer);
      });

      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.append(file.buffer, { name: file.originalname });
      archive.finalize();
    });
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only .doc, .docx, and .pdf files are allowed',
      );
    }

    const bucket = this.configService.get<string>('AWS_BUCKET_NAME');
    const ext = extname(file.originalname);
    const rawFilename = file.originalname.replace(/\.[^.]+$/, '');

    let fileBuffer = file.buffer;
    let contentType = file.mimetype;
    let finalExt = ext;
    let originalName = this.sanitizeFilename(rawFilename); // dùng tên file đã làm sạch

    if (file.mimetype === 'application/pdf') {
      fileBuffer = await this.compressPdf(file.buffer);
    }

    if (
      file.mimetype === 'application/msword' ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      fileBuffer = await this.zipWordFile(file);
      contentType = 'application/zip';
      finalExt = '.zip';
    }

    const key = `${Date.now()}-${Math.random().toString(36).substring(2)}${finalExt}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ContentDisposition: `attachment; filename="${originalName}${finalExt}"`,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('Upload to S3 failed');
    }

    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    const url = `${endpoint}/${bucket}/${key}`;
    return { url, key };
  }
}
