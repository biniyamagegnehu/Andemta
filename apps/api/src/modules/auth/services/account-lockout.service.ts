import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../../redis/redis.service';

export interface LockoutStatus {
  isLocked: boolean;
  attempts: number;
  remainingSeconds: number;
}

@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);
  private readonly inMemoryFallback = new Map<
    string,
    { attempts: number; lockedUntil: number; expiresAt: number }
  >();
  private readonly keyPrefix = 'auth:lockout:';
  private readonly windowTtlSeconds = 3600; // 1 hour window

  constructor(private readonly redisService: RedisService) {}

  /**
   * Hashes normalized email to avoid storing raw email addresses in Redis keys.
   */
  private hashEmail(normalizedEmail: string): string {
    return createHash('sha256').update(normalizedEmail).digest('hex');
  }

  private getKey(normalizedEmail: string): string {
    return `${this.keyPrefix}${this.hashEmail(normalizedEmail)}`;
  }

  /**
   * Checks whether the account has reached failed login limits and is temporarily restricted.
   * Throws a generic UnauthorizedException if locked to prevent account enumeration.
   */
  async checkLockout(normalizedEmail: string): Promise<void> {
    const key = this.getKey(normalizedEmail);
    const now = Date.now();

    try {
      const client = this.redisService.getClient();
      const rawData = await client.hgetall(key);

      if (rawData && rawData.lockedUntil) {
        const lockedUntil = Number(rawData.lockedUntil);
        if (now < lockedUntil) {
          const remainingSec = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
          this.logger.warn(
            `Login blocked: Account hash ${this.hashEmail(normalizedEmail).substring(0, 8)} is locked for ${remainingSec}s`,
          );
          throw new UnauthorizedException(
            'Too many failed login attempts. Account is temporarily restricted. Please try again later or reset your password.',
          );
        }
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(
        `Redis error checking lockout (${(error as Error).message}). Checking in-memory fallback.`,
      );
      const record = this.inMemoryFallback.get(key);
      if (record && now < record.lockedUntil) {
        throw new UnauthorizedException(
          'Too many failed login attempts. Account is temporarily restricted. Please try again later or reset your password.',
        );
      }
    }
  }

  /**
   * Records a failed login attempt and applies progressive temporary restrictions.
   * Thresholds:
   * - 1 to 4 failed attempts: tracked without delay
   * - 5 failed attempts: 1-minute temporary restriction
   * - 6 to 9 failed attempts: 5-minute temporary restriction
   * - 10+ failed attempts: 15-minute temporary restriction (bounded)
   */
  async recordFailedAttempt(normalizedEmail: string): Promise<void> {
    const key = this.getKey(normalizedEmail);
    const now = Date.now();

    try {
      const client = this.redisService.getClient();
      const currentAttempts = await client.hincrby(key, 'attempts', 1);

      let lockDurationSeconds = 0;
      if (currentAttempts >= 10) {
        lockDurationSeconds = 900; // 15 minutes
      } else if (currentAttempts >= 6) {
        lockDurationSeconds = 300; // 5 minutes
      } else if (currentAttempts >= 5) {
        lockDurationSeconds = 60; // 1 minute
      }

      if (lockDurationSeconds > 0) {
        const lockedUntil = now + lockDurationSeconds * 1000;
        await client.hset(key, 'lockedUntil', String(lockedUntil));
        this.logger.warn(
          `Account hash ${this.hashEmail(normalizedEmail).substring(0, 8)} restricted for ${lockDurationSeconds}s after ${currentAttempts} failed attempts`,
        );
      }

      await client.expire(key, this.windowTtlSeconds);
    } catch (error) {
      this.logger.warn(
        `Redis error recording failed attempt (${(error as Error).message}). Recording in in-memory fallback.`,
      );
      let record = this.inMemoryFallback.get(key);
      if (!record || now >= record.expiresAt) {
        record = {
          attempts: 0,
          lockedUntil: 0,
          expiresAt: now + this.windowTtlSeconds * 1000,
        };
        this.inMemoryFallback.set(key, record);
      }

      record.attempts += 1;
      if (record.attempts >= 10) {
        record.lockedUntil = now + 900 * 1000;
      } else if (record.attempts >= 6) {
        record.lockedUntil = now + 300 * 1000;
      } else if (record.attempts >= 5) {
        record.lockedUntil = now + 60 * 1000;
      }
    }
  }

  /**
   * Resets failed login counters upon successful authentication or password reset.
   */
  async resetLockout(normalizedEmail: string): Promise<void> {
    const key = this.getKey(normalizedEmail);
    try {
      const client = this.redisService.getClient();
      await client.del(key);
    } catch (error) {
      this.logger.warn(
        `Redis error resetting lockout (${(error as Error).message})`,
      );
    }
    this.inMemoryFallback.delete(key);
  }
}
