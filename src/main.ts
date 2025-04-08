import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './shared/interceptor/logging.interceptor';
import { TransformInterceptor } from './shared/interceptor/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Dùng cho validation DTO
  // Chỉ định các thuộc tính nào được phép trong DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Chỉ cho phép các thuộc tính đã được định nghĩa trong DTO
      forbidNonWhitelisted: true, // Nếu có thuộc tính không được định nghĩa trong DTO, sẽ trả về lỗi
      transform: true, // Tự động chuyển đổi kiểu dữ liệu
      exceptionFactory: (errors) => {
        return new UnprocessableEntityException(
          errors.map((err) => ({
            field: err.property,
            error: Object.values(err.constraints as any).join(', '), // Lấy thông báo lỗi đầu tiên
          })),
        );
      },
    }),
  );

  // INTERCEPTORS global
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
