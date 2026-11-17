import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { PrismaService } from '../../../database/prisma.service';

describe('SessionService', () => {
  let service: SessionService;
  let prismaMock: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };

  const mockUserId = '11111111-2222-3333-4444-555555555555';
  const mockTokenFamily = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const mockSessionId = '99999999-8888-7777-6666-555555555555';

  beforeEach(async () => {
    prismaMock = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'auth.refreshTokenTtlDays') return 30;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRawRefreshToken', () => {
    it('should generate a 43-character URL-safe Base64URL string', () => {
      const token1 = service.generateRawRefreshToken();
      const token2 = service.generateRawRefreshToken();

      expect(typeof token1).toBe('string');
      expect(token1.length).toBeGreaterThanOrEqual(43);
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashRefreshToken', () => {
    it('should compute a deterministic SHA-256 64-character hexadecimal hash', () => {
      const token = 'sample-test-refresh-token';
      const hash1 = service.hashRefreshToken(token);
      const hash2 = service.hashRefreshToken(token);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      const otherHash = service.hashRefreshToken('different-token');
      expect(hash1).not.toBe(otherHash);
    });
  });

  describe('createSession', () => {
    it('should create a persistent session with unique tokenFamily, hashed token, and expiration', async () => {
      const createdSession = {
        id: mockSessionId,
        userId: mockUserId,
        refreshTokenHash: 'mock-hash',
        tokenFamily: mockTokenFamily,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        rotatedAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      };

      prismaMock.session.create.mockResolvedValue(createdSession);

      const result = await service.createSession(
        mockUserId,
        'Mozilla/5.0',
        '127.0.0.1',
      );

      expect(result.rawRefreshToken).toBeDefined();
      expect(result.session).toBe(createdSession);
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          userAgent: 'Mozilla/5.0',
          ipAddress: '127.0.0.1',
        }),
      });
    });
  });

  describe('rotateSession', () => {
    const rawToken = 'valid-test-raw-refresh-token';
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const pastDate = new Date(Date.now() - 1000 * 60 * 60);

    const validSession = {
      id: mockSessionId,
      userId: mockUserId,
      refreshTokenHash: 'hash-of-valid-test-raw-refresh-token',
      tokenFamily: mockTokenFamily,
      expiresAt: futureDate,
      revokedAt: null,
      rotatedAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
      user: {
        id: mockUserId,
        email: 'user@andemta.et',
        emailVerifiedAt: new Date(),
      },
    };

    it('should atomically rotate session: mark old session rotated and create new one with same tokenFamily', async () => {
      prismaMock.session.findUnique.mockResolvedValue(validSession);
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      const newCreatedSession = {
        id: 'new-session-id',
        userId: mockUserId,
        tokenFamily: mockTokenFamily,
        expiresAt: futureDate,
      };
      prismaMock.session.create.mockResolvedValue(newCreatedSession);

      const result = await service.rotateSession(
        rawToken,
        'New-Agent',
        '10.0.0.1',
      );

      expect(result.newRawRefreshToken).toBeDefined();
      expect(result.session).toBe(newCreatedSession);
      expect(result.userId).toBe(mockUserId);
      expect(result.user.email).toBe('user@andemta.et');

      // Verify conditional update in transaction checked rotatedAt: null and revokedAt: null
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: validSession.id,
          rotatedAt: null,
          revokedAt: null,
        },
        data: expect.objectContaining({
          rotatedAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        }),
      });

      // Verify successor session created with the same tokenFamily
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          tokenFamily: mockTokenFamily,
          userAgent: 'New-Agent',
          ipAddress: '10.0.0.1',
        }),
      });
    });

    it('should throw UnauthorizedException if raw refresh token is missing or not a string', async () => {
      await expect(service.rotateSession('')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw UnauthorizedException if session is not found in database', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should DETECT REUSE when rotatedAt is not null, revoke entire tokenFamily, and throw UnauthorizedException', async () => {
      const alreadyRotatedSession = {
        ...validSession,
        rotatedAt: new Date('2026-11-16T10:00:00.000Z'),
      };
      prismaMock.session.findUnique.mockResolvedValue(alreadyRotatedSession);
      prismaMock.session.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      // Verify entire family is revoked
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          tokenFamily: mockTokenFamily,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      // Verify no new session was created
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when session is already revoked', async () => {
      const revokedSession = {
        ...validSession,
        revokedAt: new Date(),
      };
      prismaMock.session.findUnique.mockResolvedValue(revokedSession);

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        new UnauthorizedException('Session has been revoked'),
      );
    });

    it('should throw UnauthorizedException when session has expired', async () => {
      const expiredSession = {
        ...validSession,
        expiresAt: pastDate,
      };
      prismaMock.session.findUnique.mockResolvedValue(expiredSession);

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        new UnauthorizedException('Session has expired'),
      );
    });

    it('should throw UnauthorizedException and revoke session if user email is unverified', async () => {
      const unverifiedSession = {
        ...validSession,
        user: {
          id: mockUserId,
          email: 'unverified@andemta.et',
          emailVerifiedAt: null,
        },
      };
      prismaMock.session.findUnique.mockResolvedValue(unverifiedSession);

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        new UnauthorizedException('User account is invalid or unverified'),
      );

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          tokenFamily: mockTokenFamily,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it('should throw ConflictException on concurrent rotation collision (count === 0)', async () => {
      prismaMock.session.findUnique.mockResolvedValue(validSession);
      // Simulate another request winning the race
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotateSession(rawToken)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('revokeSession', () => {
    it('should revoke active sessions for the token family and return true', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: mockSessionId,
        tokenFamily: mockTokenFamily,
        userId: mockUserId,
      });
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.revokeSession('valid-token');

      expect(result).toBe(true);
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          tokenFamily: mockTokenFamily,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it('should return false if token is not found or empty', async () => {
      expect(await service.revokeSession('')).toBe(false);

      prismaMock.session.findUnique.mockResolvedValue(null);
      expect(await service.revokeSession('nonexistent-token')).toBe(false);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should revoke all active sessions for a user and return the count', async () => {
      prismaMock.session.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.revokeAllUserSessions(mockUserId);

      expect(count).toBe(3);
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });
  });
});
