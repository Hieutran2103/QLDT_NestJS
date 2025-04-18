import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MailService } from '../services/mail.service';
import { MailProcessor } from './mail.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'mail',
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
