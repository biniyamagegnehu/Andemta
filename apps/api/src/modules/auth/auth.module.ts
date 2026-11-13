import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { EmailVerificationService } from './services/email-verification.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordHashingService, EmailVerificationService],
  exports: [AuthService, PasswordHashingService, EmailVerificationService],
})
export class AuthModule {}


