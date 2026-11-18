import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../../email/interfaces/email-provider.interface';
import { PasswordHashingService } from './password-hashing.service';
import { SessionService } from './session.service';
import { generateRawToken, hashToken } from '../utils/token.utils';

export const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email address, password reset instructions will be sent.';

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  'Password has been reset successfully';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly ttlMinutes: number;
  private readonly resetBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly sessionService: SessionService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {
    this.ttlMinutes = this.configService.get<number>(
      'auth.passwordResetTokenTtlMinutes',
      30,
    );
    this.resetBaseUrl = this.configService.get<string>(
      'auth.passwordResetUrl',
      'http://localhost:3000/reset-password',
    );
  }

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
   * Initiates the password recovery workflow.
   * - Normalizes the email address.
   * - Looks up the user account.
   * - Always produces a uniform generic response regardless of whether the account exists,
   *   preventing user enumeration timing and status attacks.
   * - If the user exists:
   *   1. Invalidates previous unused reset tokens for this user.
   *   2. Generates a cryptographically secure random token (>= 32 bytes base64url).
   *   3. Persists only the SHA-256 hash with an expiration timestamp.
   *   4. Dispatches the password reset link via the configured EmailProvider.
   *   5. If email delivery fails, invalidates the newly generated token and logs a sanitized error.
   *
   * @param rawEmail Recipient email address
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(rawEmail);

    // 1. Look up user by normalized email
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
      },
    });

    // 2. Uniform response for non-existent users
    if (!user) {
      this.logger.debug('Password reset requested for non-existent email');
      return;
    }

    // 3. Invalidate any previous unused reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // 4. Generate cryptographically secure random token and calculate SHA-256 hash
    const rawToken = generateRawToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000);

    // 5. Persist only the token hash in PostgreSQL
    const tokenRecord = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      },
    });

    // 6. Build the secure reset URL containing the raw token as query parameter
    const resetUrl = `${this.resetBaseUrl}?token=${rawToken}`;

    // 7. Dispatch the password reset email
    try {
      await this.emailProvider.sendPasswordResetEmail({
        recipientEmail: user.email,
        resetUrl,
        expiresInMinutes: this.ttlMinutes,
      });

      this.logger.log(`Password reset email dispatched for user id: ${user.id}`);
    } catch (deliveryError) {
      this.logger.error(
        `Failed to deliver password reset email for user id: ${user.id}. Invalidating token.`,
      );

      // Invalidate the unused token to prevent an undelivered token remaining active
      await this.prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
    }
  }

  /**
   * Completes the password recovery workflow.
   * - Hashes the presented raw token using SHA-256.
   * - Verifies that the token exists, is unused, and has not expired.
   * - Hashes the new password using Argon2id.
   * - Atomically in a transaction:
   *   1. Conditionally consumes the token (sets usedAt) to prevent concurrent double-use.
   *   2. Updates the user's passwordHash.
   *   3. Invalidates any other outstanding unused reset tokens for the user.
   * - Revokes all active refresh-token sessions for the user across all devices.
   * - Does not issue access tokens or create new sessions.
   *
   * @param rawToken Plaintext reset token from the reset URL
   * @param newPassword Plaintext new password adhering to policy
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);

    // 1. Locate the token record by hash
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    // 2. Validate token existence
    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 3. Validate token has not already been consumed
    if (tokenRecord.usedAt !== null) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 4. Validate token expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 5. Validate associated user exists
    if (!tokenRecord.user) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 6. Hash the new password with Argon2id
    const newPasswordHash = await this.passwordHashingService.hash(newPassword);

    // 7. Atomic transaction for token consumption, password update, and token cleanup
    const resetTimestamp = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional update ensures exactly one concurrent request can consume the token
      const consumeResult = await tx.passwordResetToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: resetTimestamp,
        },
      });

      if (consumeResult.count === 0) {
        throw new BadRequestException(
          'Invalid or expired password reset token',
        );
      }

      // Update the user's password hash
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      // Invalidate any other outstanding unused reset tokens for this user
      await tx.passwordResetToken.updateMany({
        where: {
          userId: tokenRecord.userId,
          usedAt: null,
        },
        data: {
          usedAt: resetTimestamp,
        },
      });
    });

    // 8. Revoke all active sessions for this user across all devices
    await this.sessionService.revokeAllUserSessions(tokenRecord.userId);

    this.logger.log(
      `Password successfully reset and all sessions revoked for user id: ${tokenRecord.userId}`,
    );
  }
}
