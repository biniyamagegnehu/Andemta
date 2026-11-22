import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { SessionService } from './services/session.service';
import { AccountLockoutService } from './services/account-lockout.service';
import { AuthCleanupService } from './services/auth-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.accessSecret');
        const issuer =
          configService.get<string>('jwt.issuer') || 'andemta-api';
        const audience =
          configService.get<string>('jwt.audience') || 'andemta-client';
        const expiresIn =
          configService.get<string>('jwt.accessExpiresIn') || '15m';

        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn,
            issuer,
            audience,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashingService,
    EmailVerificationService,
    PasswordResetService,
    GoogleOAuthService,
    SessionService,
    AccountLockoutService,
    AuthCleanupService,
    JwtStrategy,
    JwtAuthGuard,
    CsrfOriginGuard,
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    EmailVerificationService,
    PasswordResetService,
    GoogleOAuthService,
    SessionService,
    AccountLockoutService,
    AuthCleanupService,
    JwtAuthGuard,
    CsrfOriginGuard,
    JwtStrategy,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
