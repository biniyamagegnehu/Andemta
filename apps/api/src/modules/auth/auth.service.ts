import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { EmailVerificationService } from './services/email-verification.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { DUMMY_ARGON2_HASH } from './constants/auth.constants';
import { parseDurationToSeconds } from './utils/token.utils';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Normalizes an email address according to project standards:
   * trims leading/trailing whitespace and converts to lowercase.
   *
   * @param email Raw email address
   * @returns Clean normalized email
   */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Registers a new user account with email and password.
   * - Normalizes the email address.
   * - Checks for existing accounts to provide clear early feedback.
   * - Hashes the password using Argon2id.
   * - Persists the User record in PostgreSQL.
   * - Catches database race condition unique violations (P2002) and maps to 409 Conflict.
   * - Returns only safe user attributes without exposing hashes or internal fields.
   *
   * @param dto Validated registration data
   * @returns Safe user representation (id, email, emailVerifiedAt, createdAt)
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // 1. Proactive existing account check
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Hash password with Argon2id
    const passwordHash = await this.passwordHashingService.hash(dto.password);

    // 3. Persist user and handle race condition
    try {
      const createdUser = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          emailVerifiedAt: null,
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      });

      this.logger.log(`User registered successfully (id: ${createdUser.id})`);

      // 4. Automatically trigger email verification dispatch (Phase 3.3)
      try {
        const emailResult =
          await this.emailVerificationService.issueVerificationToken(
            createdUser.id,
            createdUser.email,
          );

        if (!emailResult.success) {
          this.logger.warn(
            `Verification email delivery was not completed for user ${createdUser.id}`,
          );
        }
      } catch (emailError) {
        // Log delivery error; user remains registered and can use resend-verification endpoint
        this.logger.error(
          `Unexpected error dispatching verification email for user ${createdUser.id}: ${(emailError as Error).message}`,
        );
      }

      // 5. Return explicit safe response object
      return {
        id: createdUser.id,
        email: createdUser.email,
        emailVerifiedAt: createdUser.emailVerifiedAt,
        createdAt: createdUser.createdAt,
      };
    } catch (error) {
      // Handle concurrent insert race condition violating unique email constraint
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const isEmailTarget =
          Array.isArray(target) && target.includes('email')
            ? true
            : String(target).includes('email');

        if (isEmailTarget) {
          throw new ConflictException(
            'An account with this email already exists',
          );
        }
      }

      // Re-throw any unrelated database error so it reaches centralized filter
      throw error;
    }
  }

  /**
   * Authenticates user credentials and issues a short-lived signed JWT access token.
   *
   * Flow & Security:
   * 1. Normalizes email (trim & lowercase) to ensure case-insensitive matching.
   * 2. Retrieves account from PostgreSQL. If non-existent, executes dummy Argon2id verification
   *    to defeat timing enumeration attacks.
   * 3. Verifies plaintext password against Argon2id hash. Rejects incorrect credentials generically.
   * 4. Enforces email verification requirement (emailVerifiedAt must be set).
   * 5. Generates minimal signed JWT access token with unique JTI, issuer, audience, and expiration.
   * 6. Returns safe user projection without exposing hashes, secrets, or internal persistence fields.
   *
   * @param dto Validated login credentials (email & plaintext password)
   * @returns Signed JWT access token, token type, expiry duration, and safe user projection
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // 1. Database user lookup by normalized email
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
      },
    });

    // 2. Timing attack mitigation: verify against dummy hash if account or password hash does not exist
    if (!user || !user.passwordHash) {
      await this.passwordHashingService.verify(
        DUMMY_ARGON2_HASH,
        dto.password,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Verify candidate password against stored Argon2id hash
    const isPasswordValid = await this.passwordHashingService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Require verified email address before issuing access tokens
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Email verification is required before logging in. Please check your inbox.',
      );
    }

    // 5. Generate signed JWT access token with explicit algorithm and claims
    const tokenResult = await this.generateAccessToken(user.id);

    this.logger.log(`User logged in successfully (id: ${user.id})`);

    // 6. Return response contract without exposing internal or sensitive fields
    return {
      accessToken: tokenResult.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokenResult.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  /**
   * Generates a signed JWT access token containing standard claims:
   * sub (user ID), jti (unique UUID v4), iss, aud, iat, exp.
   *
   * @param userId Authenticated user account UUID
   * @returns Signed JWT string and expiration time in seconds
   */
  async generateAccessToken(
    userId: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const issuer =
      this.configService.get<string>('jwt.issuer') || 'andemta-api';
    const audience =
      this.configService.get<string>('jwt.audience') || 'andemta-client';
    const expiresInConfig =
      this.configService.get<string>('jwt.accessExpiresIn') || '15m';
    const expiresInSeconds = parseDurationToSeconds(expiresInConfig);

    const jti = randomUUID();

    const payload = {
      sub: userId,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      algorithm: 'HS256',
      expiresIn: expiresInConfig,
      issuer,
      audience,
    });

    return {
      accessToken,
      expiresIn: expiresInSeconds,
    };
  }
}

