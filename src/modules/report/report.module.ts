import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TokenModule } from 'src/shared/token/token.module';
import { MailModule } from 'src/shared/mail/mail.module';

@Module({
  controllers: [ReportController],
  providers: [ReportService],
  imports: [TokenModule, MailModule],
})
export class ReportModule {}
