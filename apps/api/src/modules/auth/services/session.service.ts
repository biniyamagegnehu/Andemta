import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { Session } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface CreateSessionResult {
  rawRefreshToken: string;
  session: Session;
}

export interface RotateSessionResult {
  newRawRefreshToken: string;
  session: Session;
  userId: string;
  user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    tokenVersion: number;
  };
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates a cryptographically secure random opaque refresh token.
   * Uses 32 bytes (256 bits) of random entropy encoded as Base64URL.
   *
   * @returns Raw Base64URL refresh token string
   */
  generateRawRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Computes the deterministic SHA-256 hash of a raw refresh token.
   * Only the hash is stored in the database, protecting against token exposure in DB dumps.
   *
   * @param rawRefreshToken Unhashed plaintext refresh token
   * @returns 64-character hexadecimal SHA-256 hash
   */
  hashRefreshToken(rawRefreshToken: string): string {
    return createHash('sha256').update(rawRefreshToken).digest('hex');
  }

  /**
   * Computes session expiration date based on configured TTL in days.
   *
   * @returns Future expiration Date object
   */
  getExpirationDate(): Date {
    const ttlDays =
      this.configService.get<number>('auth.refreshTokenTtlDays') || 30;
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Creates a new persistent authentication session for a user during login.
   * Generates a fresh token family UUID and records client metadata.
   *
   * @param userId User UUID
   * @param userAgent Client User-Agent header (optional)
   * @param ipAddress Client IP address (optional)
   * @returns The raw refresh token (to be sent via HttpOnly cookie) and the created Session record
   */
  async createSession(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<CreateSessionResult> {
    const rawRefreshToken = this.generateRawRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);
    const tokenFamily = randomUUID();
    const expiresAt = this.getExpirationDate();

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        tokenFamily,
        expiresAt,
        userAgent: userAgent ? userAgent.substring(0, 500) : null,
        ipAddress: ipAddress ? ipAddress.substring(0, 100) : null,
      },
    });

    this.logger.log(
      `Created session ${session.id} for user ${userId} with tokenFamily ${tokenFamily}`,
    );

    return {
      rawRefreshToken,
      session,
    };
  }

  /**
   * Performs atomic refresh-token rotation with automatic reuse detection.
   *
   * Security Protocol:
   * 1. Looks up session by SHA-256 hash of the presented refresh token.
   * 2. If the token was already rotated (rotatedAt != null), a token reuse / replay attack is detected:
   *    - Revoke all active sessions belonging to the compromised tokenFamily.
   *    - Log a security event.
   *    - Return generic 401 Unauthorized.
   * 3. Validates session status (not revoked, not expired, user verified).
   * 4. In a concurrency-safe Prisma transaction, marks the current session as rotated
   *    and creates the next generation session with the same tokenFamily.
   *
   * @param rawRefreshToken Presented opaque refresh token
   * @param userAgent Optional updated User-Agent header
   * @param ipAddress Optional updated client IP address
   * @returns New raw refresh token, updated session, and safe user projection
   */
  async rotateSession(
    rawRefreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<RotateSessionResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

    // 1. Session lookup with user details
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Reuse Detection: If token was already rotated, potential token theft has occurred!
    if (session.rotatedAt !== null) {
      this.logger.warn(
        `SECURITY ALERT: Refresh token reuse detected for session ${session.id}, user ${session.userId}, tokenFamily ${session.tokenFamily}. Revoking entire token family.`,
      );

      // Invalidate the entire compromised token family
      await this.prisma.session.updateMany({
        where: {
          tokenFamily: session.tokenFamily,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 3. Revocation check
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session has been revoked');
    }

    // 4. Expiration check
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session has expired');
    }

    // 5. User account check
    if (!session.user || !session.user.emailVerifiedAt) {
      await this.prisma.session.updateMany({
        where: {
          tokenFamily: session.tokenFamily,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new UnauthorizedException('User account is invalid or unverified');
    }

    // 6. Generate successor token
    const newRawRefreshToken = this.generateRawRefreshToken();
    const newRefreshTokenHash = this.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = this.getExpirationDate();

    // 7. Atomic transaction with conditional update to prevent race conditions
    const [_updateResult, newSession] = await this.prisma.$transaction(
      async (tx) => {
        const updateResult = await tx.session.updateMany({
          where: {
            id: session.id,
            rotatedAt: null,
            revokedAt: null,
          },
          data: {
            rotatedAt: new Date(),
            lastUsedAt: new Date(),
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Session rotation conflict: token was concurrently rotated or revoked',
          );
        }

        const createdSession = await tx.session.create({
          data: {
            userId: session.userId,
            refreshTokenHash: newRefreshTokenHash,
            tokenFamily: session.tokenFamily, // Preserves the family chain across rotations
            expiresAt: newExpiresAt,
            userAgent: userAgent
              ? userAgent.substring(0, 500)
              : session.userAgent,
            ipAddress: ipAddress
              ? ipAddress.substring(0, 100)
              : session.ipAddress,
          },
        });

        return [updateResult, createdSession];
      },
    );

    this.logger.log(
      `Rotated session ${session.id} -> ${newSession.id} for user ${session.userId} in tokenFamily ${session.tokenFamily}`,
    );

    return {
      newRawRefreshToken,
      session: newSession,
      userId: session.userId,
      user: session.user,
    };
  }

  /**
   * Revokes the current session's token family (single device logout).
   *
   * @param rawRefreshToken Presented opaque refresh token
   * @returns boolean indicating whether a session was found and revoked
   */
  async revokeSession(rawRefreshToken: string): Promise<boolean> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      return false;
    }

    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
      select: { id: true, tokenFamily: true, userId: true },
    });

    if (!session) {
      return false;
    }

    await this.prisma.session.updateMany({
      where: {
        tokenFamily: session.tokenFamily,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(
      `Revoked tokenFamily ${session.tokenFamily} for user ${session.userId}`,
    );

    return true;
  }

  /**
   * Revokes all active sessions for a user across all devices.
   *
   * @param userId Authenticated user UUID
   * @returns Number of sessions revoked
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(
      `Revoked ${result.count} active session(s) across all devices for user ${userId}`,
    );

    return result.count;
  }
}
