import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../../../database/prisma.service';
import { PasswordHashingService } from './password-hashing.service';
import { SessionService } from './session.service';
import { AccountLockoutService } from './account-lockout.service';
import { EMAIL_PROVIDER } from '../../email/interfaces/email-provider.interface';
import { hashToken } from '../utils/token.utils';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };
  let passwordHashingServiceMock: {
    hash: jest.Mock;
    verify: jest.Mock;
  };
  let sessionServiceMock: {
    revokeAllUserSessions: jest.Mock;
  };
  let emailProviderMock: {
    sendPasswordResetEmail: jest.Mock;
  };
  let accountLockoutServiceMock: {
    resetLockout: jest.Mock;
  };

  const defaultTtlMinutes = 30;
  const defaultResetUrl = 'http://localhost:3000/reset-password';

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'auth.passwordResetTokenTtlMinutes') return defaultTtlMinutes;
        if (key === 'auth.passwordResetUrl') return defaultResetUrl;
        return defaultValue;
      }),
    };

    passwordHashingServiceMock = {
      hash: jest.fn().mockResolvedValue('$argon2id$v=19$new-hash-value'),
      verify: jest.fn().mockResolvedValue(true),
    };

    sessionServiceMock = {
      revokeAllUserSessions: jest.fn().mockResolvedValue(2),
    };

    emailProviderMock = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    accountLockoutServiceMock = {
      resetLockout: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: PasswordHashingService, useValue: passwordHashingServiceMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: AccountLockoutService, useValue: accountLockoutServiceMock },
        { provide: EMAIL_PROVIDER, useValue: emailProviderMock },
      ],
    }).compile();

    service = module.get<PasswordResetService>(PasswordResetService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeEmail', () => {
    it('should trim whitespace and convert email to lowercase', () => {
      expect(service.normalizeEmail('   User.Name@Example.COM   ')).toBe(
        'user.name@example.com',
      );
    });
  });

  describe('forgotPassword', () => {
    it('should execute successfully and dispatch reset email when user exists', async () => {
      const user = {
        id: 'user-uuid-1',
        email: 'researcher@andemta.et',
      };
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.passwordResetToken.create.mockResolvedValue({
        id: 'token-uuid-1',
        userId: user.id,
        tokenHash: 'sample-sha256-hash',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      });

      await expect(
        service.forgotPassword('  Researcher@Andemta.ET  '),
      ).resolves.toBeUndefined();

      // Email lookup was normalized
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'researcher@andemta.et' },
        select: { id: true, email: true },
      });

      // Previous unused reset tokens were invalidated
      expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: expect.any(Date),
        },
      });

      // New token record was created with SHA-256 hash (64 hex characters) and expiry
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          userId: user.id,
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
          usedAt: null,
        },
      });

      // Email provider was called with reset URL containing raw token
      expect(emailProviderMock.sendPasswordResetEmail).toHaveBeenCalledWith({
        recipientEmail: user.email,
        resetUrl: expect.stringContaining(`${defaultResetUrl}?token=`),
        expiresInMinutes: defaultTtlMinutes,
      });
    });

    it('should return cleanly without throwing or sending email when user does not exist (generic response)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword('unknown@andemta.et'),
      ).resolves.toBeUndefined();

      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailProviderMock.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should safely handle email delivery failure by invalidating the token without exposing error', async () => {
      const user = {
        id: 'user-uuid-1',
        email: 'researcher@andemta.et',
      };
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.passwordResetToken.create.mockResolvedValue({
        id: 'token-uuid-to-invalidate',
        userId: user.id,
        tokenHash: 'sample-sha256-hash',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
      });
      prismaMock.passwordResetToken.update.mockResolvedValue({});

      emailProviderMock.sendPasswordResetEmail.mockRejectedValue(
        new Error('SMTP connection timed out'),
      );

      // Must NOT re-throw; must complete silently to avoid revealing account existence
      await expect(
        service.forgotPassword(user.email),
      ).resolves.toBeUndefined();

      // Newly generated token must be invalidated
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-uuid-to-invalidate' },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('resetPassword', () => {
    const rawToken = 'my-super-secret-raw-reset-token';
    const rawTokenHash = hashToken(rawToken);
    const validUserId = 'user-uuid-123';

    it('should validate token, hash new password with Argon2id, atomically consume token, and revoke all sessions', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      const tokenRecord = {
        id: 'reset-token-uuid-1',
        userId: validUserId,
        tokenHash: rawTokenHash,
        expiresAt: futureDate,
        usedAt: null,
        user: { id: validUserId },
      };

      prismaMock.passwordResetToken.findUnique.mockResolvedValue(tokenRecord);
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.update.mockResolvedValue({});

      await service.resetPassword(rawToken, 'NewSecurePassword123!');

      // 1. Password hashed with Argon2id
      expect(passwordHashingServiceMock.hash).toHaveBeenCalledWith(
        'NewSecurePassword123!',
      );

      // 2. Transaction used for atomic consumption and update
      expect(prismaMock.$transaction).toHaveBeenCalled();

      // 3. User password updated with token version increment for immediate access token revocation
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: validUserId },
        data: {
          passwordHash: '$argon2id$v=19$new-hash-value',
          tokenVersion: { increment: 1 },
        },
      });

      // 4. Token marked as used
      expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: tokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: expect.any(Date),
        },
      });

      // 5. All active sessions for this user revoked
      expect(sessionServiceMock.revokeAllUserSessions).toHaveBeenCalledWith(
        validUserId,
      );
    });

    it('should reject with BadRequestException when token does not exist in database', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('nonexistent-token', 'NewSecurePassword123!'),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );

      expect(passwordHashingServiceMock.hash).not.toHaveBeenCalled();
      expect(sessionServiceMock.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('should reject with BadRequestException when token has already been used', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-used',
        userId: validUserId,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: new Date(Date.now() - 5 * 60 * 1000),
        user: { id: validUserId },
      });

      await expect(
        service.resetPassword(rawToken, 'NewSecurePassword123!'),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );

      expect(passwordHashingServiceMock.hash).not.toHaveBeenCalled();
    });

    it('should reject with BadRequestException when token has expired', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-expired',
        userId: validUserId,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
        usedAt: null,
        user: { id: validUserId },
      });

      await expect(
        service.resetPassword(rawToken, 'NewSecurePassword123!'),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );

      expect(passwordHashingServiceMock.hash).not.toHaveBeenCalled();
    });

    it('should reject with BadRequestException when associated user does not exist', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-orphan',
        userId: 'deleted-user-uuid',
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
        user: null,
      });

      await expect(
        service.resetPassword(rawToken, 'NewSecurePassword123!'),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );
    });

    it('should reject concurrent requests attempting to use the same token (concurrency safety)', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      const tokenRecord = {
        id: 'reset-token-uuid-concurrent',
        userId: validUserId,
        tokenHash: rawTokenHash,
        expiresAt: futureDate,
        usedAt: null,
        user: { id: validUserId },
      };

      prismaMock.passwordResetToken.findUnique.mockResolvedValue(tokenRecord);

      // Simulate race condition: updateMany returns count: 0 (another concurrent request consumed it first)
      prismaMock.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.resetPassword(rawToken, 'NewSecurePassword123!'),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );

      // Session revocation should NOT happen if consumption failed
      expect(sessionServiceMock.revokeAllUserSessions).not.toHaveBeenCalled();
    });
  });
});
