import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';

export interface CleanupResult {
  deletedSessions: number;
  deletedEmailVerificationTokens: number;
  deletedPasswordResetTokens: number;
  retentionDays: number;
  cutoff: Date;
}

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);
  private readonly lockKey = 'lock:auth-cleanup';
  private readonly lockTtlSeconds = 300; // 5 minute lock timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Cleans expired and revoked authentication records older than the retention period.
   *
   * Security & Integrity guarantees:
   * 1. Active sessions are NEVER deleted.
   * 2. Unused, unexpired verification and reset tokens are NEVER deleted.
   * 3. Uses distributed Redis lock to prevent concurrent overlapping executions.
   * 4. Logs aggregate counts only without exposing token hashes or user data.
   * 5. Fully idempotent.
   *
   * @param retentionDays Number of days to retain expired/revoked records (default from config or 30 days)
   */
  async cleanExpiredRecords(retentionDaysOverride?: number): Promise<CleanupResult> {
    const retentionDays =
      retentionDaysOverride ??
      this.configService.get<number>('auth.cleanupRetentionDays', 30);

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Prevent overlapping executions using Redis lock
    let acquiredLock = false;
    try {
      const client = this.redisService.getClient();
      const lockAcquired = await client.set(
        this.lockKey,
        '1',
        'EX',
        this.lockTtlSeconds,
        'NX',
      );
      if (!lockAcquired) {
        this.logger.warn('Skipping auth cleanup: cleanup job is already running on another instance');
        return {
          deletedSessions: 0,
          deletedEmailVerificationTokens: 0,
          deletedPasswordResetTokens: 0,
          retentionDays,
          cutoff,
        };
      }
      acquiredLock = true;
    } catch (redisError) {
      this.logger.warn(
        `Redis lock unavailable for auth cleanup (${(redisError as Error).message}). Proceeding without lock.`,
      );
    }

    try {
      this.logger.log(
        `Starting auth cleanup for records older than ${retentionDays} days (cutoff: ${cutoff.toISOString()})`,
      );

      // 1. Delete sessions where either revoked or expired, and timestamp is older than cutoff
      const sessionsResult = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { revokedAt: { not: null, lte: cutoff } },
            { expiresAt: { lte: cutoff } },
          ],
        },
      });

      // 2. Delete email verification tokens where used or expired, older than cutoff
      const emailTokensResult =
        await this.prisma.emailVerificationToken.deleteMany({
          where: {
            OR: [
              { usedAt: { not: null, lte: cutoff } },
              { expiresAt: { lte: cutoff } },
            ],
          },
        });

      // 3. Delete password reset tokens where used or expired, older than cutoff
      const passwordTokensResult =
        await this.prisma.passwordResetToken.deleteMany({
          where: {
            OR: [
              { usedAt: { not: null, lte: cutoff } },
              { expiresAt: { lte: cutoff } },
            ],
          },
        });

      this.logger.log(
        `Auth cleanup completed: removed ${sessionsResult.count} session(s), ` +
          `${emailTokensResult.count} email token(s), ${passwordTokensResult.count} password reset token(s).`,
      );

      return {
        deletedSessions: sessionsResult.count,
        deletedEmailVerificationTokens: emailTokensResult.count,
        deletedPasswordResetTokens: passwordTokensResult.count,
        retentionDays,
        cutoff,
      };
    } finally {
      if (acquiredLock) {
        try {
          await this.redisService.getClient().del(this.lockKey);
        } catch {
          // Lock will naturally expire
        }
      }
    }
  }
}
