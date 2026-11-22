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
import { SessionService } from './services/session.service';
import { AccountLockoutService } from './services/account-lockout.service';
import { DUMMY_ARGON2_HASH } from './constants/auth.constants';
import { parseDurationToSeconds } from './utils/token.utils';

export interface LoginResult extends LoginResponseDto {
  rawRefreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly accountLockoutService: AccountLockoutService,
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
   * Authenticates user credentials, issues a short-lived signed JWT access token,
   * and establishes a persistent session with an opaque refresh token.
   *
   * Flow & Security:
   * 1. Normalizes email (trim & lowercase) to ensure case-insensitive matching.
   * 2. Retrieves account from PostgreSQL. If non-existent, executes dummy Argon2id verification
   *    to defeat timing enumeration attacks.
   * 3. Verifies plaintext password against Argon2id hash. Rejects incorrect credentials generically.
   * 4. Enforces email verification requirement (emailVerifiedAt must be set).
   * 5. Generates minimal signed JWT access token with unique JTI, issuer, audience, and expiration.
   * 6. Creates a persistent Session with a SHA-256 hashed refresh token and unique token family.
   * 7. Returns safe user projection and access token, plus raw refresh token for cookie transport.
   *
   * @param dto Validated login credentials (email & plaintext password)
   * @param userAgent Optional client User-Agent
   * @param ipAddress Optional client IP address
   * @returns Login result containing access token, safe user projection, and raw refresh token
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResult> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // 1. Account lockout protection (Stage B)
    await this.accountLockoutService.checkLockout(normalizedEmail);

    // 2. Database user lookup by normalized email
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        tokenVersion: true,
        emailVerifiedAt: true,
      },
    });

    // 3. Timing attack mitigation: verify against dummy hash if account or password hash does not exist
    if (!user || !user.passwordHash) {
      await this.accountLockoutService.recordFailedAttempt(normalizedEmail);
      await this.passwordHashingService.verify(
        DUMMY_ARGON2_HASH,
        dto.password,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Verify candidate password against stored Argon2id hash
    const isPasswordValid = await this.passwordHashingService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      await this.accountLockoutService.recordFailedAttempt(normalizedEmail);
      throw new UnauthorizedException('Invalid email or password');
    }

    // 5. Reset lockout counter on successful password verification
    await this.accountLockoutService.resetLockout(normalizedEmail);

    // 6. Require verified email address before issuing access tokens
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Email verification is required before logging in. Please check your inbox.',
      );
    }

    // 7. Generate signed JWT access token with token version
    const tokenResult = await this.generateAccessToken(user.id, user.tokenVersion);

    // 8. Create persistent authentication session and opaque refresh token
    const sessionResult = await this.sessionService.createSession(
      user.id,
      userAgent,
      ipAddress,
    );

    this.logger.log(`User logged in successfully (id: ${user.id})`);

    // 9. Return response contract along with raw refresh token for cookie transport
    return {
      accessToken: tokenResult.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokenResult.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      rawRefreshToken: sessionResult.rawRefreshToken,
    };
  }

  /**
   * Refreshes an expired access token using an opaque refresh token with automatic rotation.
   * Enforces reuse detection and revokes compromised token families.
   *
   * @param rawRefreshToken Presented opaque refresh token
   * @param userAgent Optional client User-Agent
   * @param ipAddress Optional client IP address
   * @returns Fresh access token, expiration, user profile, and new raw refresh token
   */
  async refreshSession(
    rawRefreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ loginResponse: LoginResponseDto; rawRefreshToken: string }> {
    const rotationResult = await this.sessionService.rotateSession(
      rawRefreshToken,
      userAgent,
      ipAddress,
    );

    const tokenResult = await this.generateAccessToken(
      rotationResult.userId,
      rotationResult.user.tokenVersion,
    );

    return {
      loginResponse: {
        accessToken: tokenResult.accessToken,
        tokenType: 'Bearer',
        expiresIn: tokenResult.expiresIn,
        user: {
          id: rotationResult.user.id,
          email: rotationResult.user.email,
          emailVerifiedAt: rotationResult.user.emailVerifiedAt,
        },
      },
      rawRefreshToken: rotationResult.newRawRefreshToken,
    };
  }

  /**
   * Logs out the current session by revoking its token family.
   *
   * @param rawRefreshToken Presented opaque refresh token
   */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.sessionService.revokeSession(rawRefreshToken);
  }

  /**
   * Logs out all sessions across all devices for the specified user and
   * atomically increments tokenVersion to immediately invalidate all access tokens.
   *
   * @param userId Authenticated user UUID
   */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
    });
    await this.sessionService.revokeAllUserSessions(userId);
  }

  /**
   * Generates a signed JWT access token containing standard claims:
   * sub (user ID), tokenVersion (version counter), jti (unique UUID v4), iss, aud, iat, exp.
   *
   * @param userId Authenticated user account UUID
   * @param tokenVersion Current account token version
   * @returns Signed JWT string and expiration time in seconds
   */
  async generateAccessToken(
    userId: string,
    tokenVersion = 0,
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
      tokenVersion,
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

