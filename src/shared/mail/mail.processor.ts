import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailService } from '../services/mail.service';

interface MailJob {
  from: string;
  to: string;
  subject: string;
  html: string;
}

@Processor('mail')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process('send')
  async handleSendMail(job: Job<MailJob>) {
    try {
      const { from, to, subject, html } = job.data;

      this.logger.log(`Processing mail job ${job.id} to: ${to}`);

      await this.mailService.sendMail(from, to, subject, html);

      this.logger.log(`Mail sent successfully: ${job.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send mail: ${error.message}`, error.stack);
      throw error;
    }
  }
}
