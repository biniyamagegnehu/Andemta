import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../../email/interfaces/email-provider.interface';

export interface IssueTokenResult {
  success: boolean;
  error?: Error;
}

export interface VerifyEmailResult {
  email: string;
  emailVerifiedAt: Date;
}

export interface GenericMessageResult {
  message: string;
}

export const GENERIC_RESEND_MESSAGE =
  'If an account requires email verification, a verification email will be sent.';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly ttlMinutes: number;
  private readonly verificationBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {
    this.ttlMinutes = this.configService.get<number>(
      'email.tokenTtlMinutes',
      30,
    );
    this.verificationBaseUrl = this.configService.get<string>(
      'email.verificationUrl',
      'http://localhost:3000/verify-email',
    );
  }

  /**
   * Generates at least 32 cryptographically secure random bytes encoded as base64url.
   * High entropy (256 bits) prevents enumeration or predictability.
   */
  generateRawToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Computes a SHA-256 hash of the raw token for secure database persistence.
   * Raw tokens are never stored, logged, or exposed.
   */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Issues a verification token for an unverified user and sends the verification email.
   * - Checks whether user is already verified (no-op if verified).
   * - Invalidates any previous unused tokens for this user.
   * - Persists the SHA-256 hash and expiration timestamp.
   * - Sends transactional email via configured EmailProvider.
   * - If sending fails, invalidates the newly created token so no undelivered active token remains.
   *
   * @param userId Unique identifier of the user
   * @param recipientEmail Recipient email address
   */
  async issueVerificationToken(
    userId: string,
    recipientEmail: string,
  ): Promise<IssueTokenResult> {
    // 1. Verify user exists and is not already verified
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt !== null) {
      this.logger.debug(
        `Skipping token issuance: user ${userId} not found or already verified`,
      );
      return { success: false };
    }

    // 2. Invalidate previous unused verification tokens for this user
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // 3. Generate raw token and hash
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000);

    // 4. Persist token hash in database
    const tokenRecord = await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
      },
    });

    // 5. Construct verification URL (never log this complete URL)
    const verificationUrl = `${this.verificationBaseUrl}?token=${rawToken}`;

    // 6. Attempt delivery via email provider
    try {
      await this.emailProvider.sendVerificationEmail({
        recipientEmail,
        verificationUrl,
        expiresInMinutes: this.ttlMinutes,
      });

      this.logger.log(`Verification email dispatched for user id: ${userId}`);
      return { success: true };
    } catch (deliveryError) {
      this.logger.error(
        `Failed to deliver verification email for user id: ${userId}. Invalidating token.`,
      );

      // Invalidate the newly created token so an undelivered token is not active
      await this.prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      return {
        success: false,
        error: deliveryError as Error,
      };
    }
  }

  /**
   * Consumes a verification token and updates the user's email verification status.
   * - Hashes incoming raw token using SHA-256.
   * - Enforces single-use, non-expired, and non-used token constraints.
   * - Uses atomic database transaction with conditional update to prevent concurrent double-consumption.
   *
   * @param rawToken Raw token submitted by the client
   */
  async verifyEmail(rawToken: string): Promise<VerifyEmailResult> {
    const tokenHash = this.hashToken(rawToken);

    // 1. Locate token record
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // 2. Validate token has not already been used
    if (tokenRecord.usedAt !== null) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // 3. Validate token expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // 4. Check if user is already verified
    if (tokenRecord.user.emailVerifiedAt !== null) {
      // Invalidate token to avoid future attempts
      await this.prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException('Email is already verified');
    }

    // 5. Atomically consume token and verify user in a database transaction
    const verificationTimestamp = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional update ensures only one concurrent request consumes the token
      const consumeResult = await tx.emailVerificationToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: verificationTimestamp,
        },
      });

      if (consumeResult.count === 0) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      // Mark user email verified
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          emailVerifiedAt: verificationTimestamp,
        },
      });
    });

    this.logger.log(
      `Email verified successfully for user id: ${tokenRecord.userId}`,
    );

    return {
      email: tokenRecord.user.email,
      emailVerifiedAt: verificationTimestamp,
    };
  }

  /**
   * Resends a verification email for an unverified account.
   * Always returns a generic response to prevent account enumeration.
   *
   * @param email Raw email address submitted by client
   */
  async resendVerification(email: string): Promise<GenericMessageResult> {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Look up user by normalized email
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    // 2. If user does not exist or is already verified, return generic message immediately
    if (!user || user.emailVerifiedAt !== null) {
      this.logger.debug(
        'Resend verification requested for non-existent or already-verified email',
      );
      return { message: GENERIC_RESEND_MESSAGE };
    }

    // 3. Issue replacement verification token and dispatch email
    await this.issueVerificationToken(user.id, user.email);

    // 4. Return identical generic message
    return { message: GENERIC_RESEND_MESSAGE };
  }
}

