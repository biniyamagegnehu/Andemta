import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
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
}


