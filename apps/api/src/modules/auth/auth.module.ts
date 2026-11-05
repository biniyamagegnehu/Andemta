import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHashingService } from './services/password-hashing.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordHashingService],
  exports: [AuthService, PasswordHashingService],
})
export class AuthModule {}

