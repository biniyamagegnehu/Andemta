import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './interfaces/email-provider.interface';
import { NodemailerEmailProvider } from './providers/nodemailer-email.provider';

@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: NodemailerEmailProvider,
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}

