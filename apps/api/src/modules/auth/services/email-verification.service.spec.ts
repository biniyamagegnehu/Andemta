import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailVerificationService,
  GENERIC_RESEND_MESSAGE,
} from './email-verification.service';
import { PrismaService } from '../../../database/prisma.service';
import { EMAIL_PROVIDER } from '../../email/interfaces/email-provider.interface';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    emailVerificationToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let emailProviderMock: {
    sendVerificationEmail: jest.Mock;
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        'email.tokenTtlMinutes': 30,
        'email.verificationUrl': 'http://localhost:3000/verify-email',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailVerificationToken: {
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

    emailProviderMock = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EMAIL_PROVIDER, useValue: emailProviderMock },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Token Generation and Hashing', () => {
    it('should generate secure base64url raw tokens with high entropy', () => {
      const token = service.generateRawToken();
      expect(typeof token).toBe('string');
      // 32 bytes base64url is 43 characters long
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    });

    it('should generate distinct, unique tokens on consecutive calls', () => {
      const token1 = service.generateRawToken();
      const token2 = service.generateRawToken();
      expect(token1).not.toBe(token2);
    });

    it('should deterministically produce 64-char SHA-256 hex string for a given token', () => {
      const raw = 'test-token-value-12345';
      const hash1 = service.hashToken(raw);
      const hash2 = service.hashToken(raw);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
    });
  });

  describe('issueVerificationToken', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const email = 'newuser@andemta.et';

    it('should invalidate previous unused tokens, persist new token hash, and send verification email', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email,
        emailVerifiedAt: null,
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 2,
      });

      prismaMock.emailVerificationToken.create.mockResolvedValueOnce({
        id: 'token-uuid-1',
        userId,
        tokenHash: 'hashed-token-value',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const result = await service.issueVerificationToken(userId, email);

      expect(result.success).toBe(true);

      // Invalidate previous tokens
      expect(prismaMock.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });

      // Persist new token hash
      expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          usedAt: null,
        }),
      });

      // Verification email sent
      expect(emailProviderMock.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: email,
          verificationUrl: expect.stringContaining(
            'http://localhost:3000/verify-email?token=',
          ),
          expiresInMinutes: 30,
        }),
      );
    });

    it('should not issue token if user is already verified', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email,
        emailVerifiedAt: new Date(),
      });

      const result = await service.issueVerificationToken(userId, email);

      expect(result.success).toBe(false);
      expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailProviderMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should invalidate newly created token and return success: false when email sending fails', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email,
        emailVerifiedAt: null,
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      prismaMock.emailVerificationToken.create.mockResolvedValueOnce({
        id: 'token-uuid-failed',
        userId,
        tokenHash: 'hashed-val',
      });

      emailProviderMock.sendVerificationEmail.mockRejectedValueOnce(
        new Error('Brevo SMTP unreachable'),
      );

      const result = await service.issueVerificationToken(userId, email);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Brevo SMTP unreachable');

      // Verify the newly created token was invalidated so an active undelivered token does not persist
      expect(prismaMock.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'token-uuid-failed' },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('verifyEmail', () => {
    const rawToken = 'sample-valid-raw-token';
    const userId = 'user-uuid-123';
    const email = 'user@andemta.et';

    it('should successfully verify email, mark token as used, and set user emailVerifiedAt', async () => {
      const tokenHash = service.hashToken(rawToken);

      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'token-record-id',
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Valid for 15 more minutes
        usedAt: null,
        user: {
          id: userId,
          email,
          emailVerifiedAt: null,
        },
      });

      prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      prismaMock.user.update.mockResolvedValueOnce({
        id: userId,
        email,
        emailVerifiedAt: new Date(),
      });

      const result = await service.verifyEmail(rawToken);

      expect(result.email).toBe(email);
      expect(result.emailVerifiedAt).toBeInstanceOf(Date);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-record-id', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('should throw BadRequestException when token does not exist in database', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.verifyEmail('nonexistent-token')).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );
    });

    it('should throw BadRequestException when token has already been used', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'token-id',
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: new Date(Date.now() - 5 * 60 * 1000), // Already used 5 minutes ago
        user: { id: userId, email, emailVerifiedAt: null },
      });

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );
    });

    it('should throw BadRequestException when token has expired', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'token-id',
        userId,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        usedAt: null,
        user: { id: userId, email, emailVerifiedAt: null },
      });

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );
    });

    it('should throw BadRequestException when user is already verified', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'token-id',
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
        user: {
          id: userId,
          email,
          emailVerifiedAt: new Date(Date.now() - 60000), // Already verified
        },
      });

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(
        new BadRequestException('Email is already verified'),
      );

      // Verify the token is invalidated
      expect(prismaMock.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'token-id' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('should throw BadRequestException if concurrent request consumes token first during transaction', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'token-id',
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
        user: { id: userId, email, emailVerifiedAt: null },
      });

      // Simulate concurrent consume: updateMany returns count 0
      prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(
        new BadRequestException('Invalid or expired verification token'),
      );
    });
  });

  describe('resendVerification', () => {
    const rawEmail = '  Participant@Andemta.ET  ';
    const normalizedEmail = 'participant@andemta.et';
    const userId = 'user-uuid-999';

    it('should issue replacement token and return generic message for existing unverified user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        email: normalizedEmail,
        emailVerifiedAt: null,
      });

      // Mock issueVerificationToken internals
      prismaMock.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      prismaMock.emailVerificationToken.create.mockResolvedValueOnce({
        id: 'new-token-id',
        userId,
      });

      const response = await service.resendVerification(rawEmail);

      expect(response).toEqual({
        message: GENERIC_RESEND_MESSAGE,
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: normalizedEmail },
        select: { id: true, email: true, emailVerifiedAt: true },
      });

      expect(emailProviderMock.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should return identical generic message without issuing token if user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const response = await service.resendVerification('nonexistent@andemta.et');

      expect(response).toEqual({
        message: GENERIC_RESEND_MESSAGE,
      });

      expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailProviderMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should return identical generic message without issuing token if user is already verified', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: userId,
        email: normalizedEmail,
        emailVerifiedAt: new Date(),
      });

      const response = await service.resendVerification(rawEmail);

      expect(response).toEqual({
        message: GENERIC_RESEND_MESSAGE,
      });

      expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailProviderMock.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
