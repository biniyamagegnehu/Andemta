import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, LoginUserDto } from './dto/login-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { setRefreshCookie, clearRefreshCookie } from './utils/cookie.utils';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user account using email and password with Argon2id hashing and dispatches a verification email. Does not automatically log in or issue tokens.',
  })
  @SwaggerApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: RegisterResponseDto,
  })
  @SwaggerApiResponse({
    status: 400,
    description:
      'Validation failed (e.g. invalid email address, password shorter than 12 characters, unexpected properties)',
  })
  @SwaggerApiResponse({
    status: 409,
    description: 'An account with this email already exists',
  })
  @ResponseMessage('User registered successfully')
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify user email address using token',
    description:
      'Consumes a single-use verification token, validates expiration, and marks the user account email verified.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Email verified successfully',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Invalid, expired, or already-used verification token',
  })
  @ResponseMessage('Email verified successfully')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerificationService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend email verification link',
    description:
      'Issues a replacement verification token and dispatches a new email for unverified accounts. Always returns a generic response to prevent account enumeration.',
  })
  @SwaggerApiResponse({
    status: 200,
    description:
      'If an account requires email verification, a verification email will be sent.',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Validation failed (e.g. invalid email address)',
  })
  @ResponseMessage(
    'If an account requires email verification, a verification email will be sent.',
  )
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.emailVerificationService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset instructions',
    description:
      'Issues a secure one-time password reset token and dispatches an email if an account with the specified email exists. Always returns the same generic response to prevent account enumeration.',
  })
  @SwaggerApiResponse({
    status: 200,
    description:
      'If an account exists for this email address, password reset instructions will be sent.',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Validation failed (e.g. invalid email address format)',
  })
  @ResponseMessage(
    'If an account exists for this email address, password reset instructions will be sent.',
  )
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<Record<string, never>> {
    await this.passwordResetService.forgotPassword(dto.email);
    return {};
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset account password using one-time token',
    description:
      'Validates the one-time reset token, updates the account password with a fresh Argon2id hash, invalidates all outstanding reset tokens, and revokes all active authentication sessions across devices.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Password has been reset successfully',
  })
  @SwaggerApiResponse({
    status: 400,
    description:
      'Invalid, expired, or already-used reset token, or password does not meet complexity requirements',
  })
  @ResponseMessage('Password has been reset successfully')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<Record<string, never>> {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    return {};
  }

  @Get('google')
  @ApiOperation({
    summary: 'Initiate Google OAuth 2.0 login / registration',
    description:
      'Generates a cryptographically secure authorization URL with PKCE S256 and OIDC nonce, stores transaction state in Redis, and redirects the browser to Google accounts sign-in.',
  })
  @SwaggerApiResponse({
    status: 302,
    description: 'Redirect to Google OAuth authorization endpoint',
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'Google OAuth is not configured on this server',
  })
  async googleLogin(@Res() res: Response): Promise<void> {
    const authUrl = await this.googleOAuthService.generateAuthUrl('login');
    res.redirect(authUrl);
  }

  @Get('google/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initiate Google account linking for authenticated user',
    description:
      'Initiates Google OAuth flow to link an external Google identity to the currently authenticated user account.',
  })
  @SwaggerApiResponse({
    status: 302,
    description:
      'Redirect to Google OAuth authorization endpoint with link transaction bound to user',
  })
  @SwaggerApiResponse({
    status: 401,
    description: 'Unauthorized — requires valid Bearer access token',
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'Google OAuth is not configured on this server',
  })
  async googleLink(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const authUrl = await this.googleOAuthService.generateAuthUrl(
      'link',
      user.id,
    );
    res.redirect(authUrl);
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Handle Google OAuth 2.0 authorization callback',
    description:
      'Validates callback state, exchanges code for tokens using PKCE verifier, verifies Google ID token, authenticates or links user, sets HttpOnly refresh cookie, and redirects to frontend destination.',
  })
  @SwaggerApiResponse({
    status: 302,
    description: 'Redirect to frontend success or failure destination',
  })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.redirect(this.googleOAuthService.buildFailureUrl(error));
      return;
    }

    if (!code || !state) {
      res.redirect(this.googleOAuthService.buildFailureUrl('invalid_request'));
      return;
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    const result = await this.googleOAuthService.handleCallback(
      code,
      state,
      userAgent,
      ipAddress,
    );

    if (result.success && result.rawRefreshToken) {
      setRefreshCookie(res, result.rawRefreshToken, this.configService);
    }

    res.redirect(result.redirectUrl);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate user credentials, issue access token and set refresh cookie',
    description:
      'Validates email and password, enforces email verification requirement, generates a signed short-lived JWT access token, creates a persistent session in PostgreSQL, and delivers an opaque refresh token via HttpOnly cookie.',
  })
  @SwaggerApiResponse({
    status: 200,
    description:
      'Login successful. Access token returned in JSON body, refresh token set as HttpOnly cookie.',
    type: LoginResponseDto,
  })
  @SwaggerApiResponse({
    status: 400,
    description:
      'Validation failed (e.g. invalid email address format, missing password)',
  })
  @SwaggerApiResponse({
    status: 401,
    description:
      'Invalid email or password, or email verification is required before login',
  })
  @ResponseMessage('Login successful')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    const { rawRefreshToken, ...loginResponse } =
      await this.authService.login(dto, userAgent, ipAddress);

    setRefreshCookie(res, rawRefreshToken, this.configService);
    return loginResponse;
  }

  @Post('refresh')
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate refresh token and issue new access token',
    description:
      'Consumes the HttpOnly refresh token cookie, validates session persistence, detects token reuse, rotates to a new refresh token (setting a new HttpOnly cookie), and returns a fresh JWT access token.',
  })
  @SwaggerApiResponse({
    status: 200,
    description:
      'Token refreshed successfully. Fresh access token returned and new refresh cookie set.',
    type: LoginResponseDto,
  })
  @SwaggerApiResponse({
    status: 401,
    description:
      'Missing, invalid, expired, revoked, or reused refresh token (token family revoked on reuse detection)',
  })
  @SwaggerApiResponse({
    status: 403,
    description: 'Untrusted request origin (CSRF defense)',
  })
  @ResponseMessage('Token refreshed successfully')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const cookieName =
      this.configService.get<string>('auth.refreshCookieName') ||
      'andemta_refresh';
    const rawRefreshToken = req.cookies?.[cookieName];

    if (!rawRefreshToken) {
      clearRefreshCookie(res, this.configService);
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const { loginResponse, rawRefreshToken: newRawRefreshToken } =
        await this.authService.refreshSession(
          rawRefreshToken,
          userAgent,
          ipAddress,
        );

      setRefreshCookie(res, newRawRefreshToken, this.configService);
      return loginResponse;
    } catch (error) {
      clearRefreshCookie(res, this.configService);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out current session',
    description:
      'Revokes the current session token family in PostgreSQL and clears the HttpOnly refresh token cookie.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  @SwaggerApiResponse({
    status: 403,
    description: 'Untrusted request origin (CSRF defense)',
  })
  @ResponseMessage('Logged out successfully')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    const cookieName =
      this.configService.get<string>('auth.refreshCookieName') ||
      'andemta_refresh';
    const rawRefreshToken = req.cookies?.[cookieName];

    if (rawRefreshToken) {
      try {
        await this.authService.logout(rawRefreshToken);
      } catch {
        // Idempotent logout: proceed with clearing the cookie even if revocation encounters an error
      }
    }

    clearRefreshCookie(res, this.configService);
    return {};
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out from all devices',
    description:
      'Revokes all active sessions across all devices for the authenticated user and clears the current device refresh cookie.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'All sessions logged out successfully',
  })
  @SwaggerApiResponse({
    status: 401,
    description: 'Missing, invalid, or expired Bearer access token',
  })
  @ResponseMessage('All sessions logged out successfully')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    await this.authService.logoutAll(user.id);
    clearRefreshCookie(res, this.configService);
    return {};
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current authenticated user profile',
    description:
      'Retrieves safe authenticated user claims from the verified JWT access token. Demonstrates JwtAuthGuard and @CurrentUser() decorator.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: LoginUserDto,
  })
  @SwaggerApiResponse({
    status: 401,
    description: 'Missing, invalid, or expired access token',
  })
  @ResponseMessage('Profile retrieved successfully')
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthenticatedUser> {
    return user;
  }
}
