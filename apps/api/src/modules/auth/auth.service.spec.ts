import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { EmailVerificationService } from './services/email-verification.service';
import { DUMMY_ARGON2_HASH } from './constants/auth.constants';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    session?: {
      create: jest.Mock;
    };
  };
  let passwordHashingMock: {
    hash: jest.Mock;
    verify: jest.Mock;
  };
  let emailVerificationMock: {
    issueVerificationToken: jest.Mock;
  };
  let jwtServiceMock: {
    signAsync: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    passwordHashingMock = {
      hash: jest.fn().mockResolvedValue('$argon2id$v=19$mocked_hash_value'),
      verify: jest.fn().mockResolvedValue(true),
    };

    emailVerificationMock = {
      issueVerificationToken: jest.fn().mockResolvedValue({ success: true }),
    };

    jwtServiceMock = {
      signAsync: jest.fn().mockResolvedValue('mocked-signed-jwt-access-token'),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret')
          return 'super-secret-key-at-least-32-chars-long-for-testing';
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.issuer') return 'andemta-api';
        if (key === 'jwt.audience') return 'andemta-client';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordHashingService, useValue: passwordHashingMock },
        { provide: EmailVerificationService, useValue: emailVerificationMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeEmail', () => {
    it('should trim leading/trailing whitespace and convert to lowercase', () => {
      expect(service.normalizeEmail('   AbEbe@AndEmTa.ET   ')).toBe(
        'abebe@andemta.et',
      );
      expect(service.normalizeEmail('User.One@EXAMPLE.com')).toBe(
        'user.one@example.com',
      );
    });
  });

  describe('register', () => {
    const rawDto = {
      email: '  NewUser@Andemta.ET  ',
      password: 'StrongPassword123!',
    };
    const expectedNormalizedEmail = 'newuser@andemta.et';
    const mockCreatedUser = {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      email: expectedNormalizedEmail,
      emailVerifiedAt: null,
      createdAt: new Date('2026-11-05T20:00:00.000Z'),
    };

    it('should successfully register a user and return only safe fields', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockCreatedUser);

      const result = await service.register(rawDto);

      // Verify email normalization
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: expectedNormalizedEmail },
        select: { id: true },
      });

      // Verify password hashing before database write
      expect(passwordHashingMock.hash).toHaveBeenCalledWith(rawDto.password);

      // Verify data sent to Prisma
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: expectedNormalizedEmail,
          passwordHash: '$argon2id$v=19$mocked_hash_value',
          emailVerifiedAt: null,
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      });

      // Verify verification token issuance was triggered
      expect(
        emailVerificationMock.issueVerificationToken,
      ).toHaveBeenCalledWith(mockCreatedUser.id, expectedNormalizedEmail);

      // Verify safe response format (no sensitive fields)
      expect(result).toEqual({
        id: mockCreatedUser.id,
        email: expectedNormalizedEmail,
        emailVerifiedAt: null,
        createdAt: mockCreatedUser.createdAt,
      });
      expect((result as unknown as Record<string, unknown>).password).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should complete registration successfully even if verification email delivery fails', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockCreatedUser);
      emailVerificationMock.issueVerificationToken.mockResolvedValueOnce({
        success: false,
        error: new Error('Brevo service down'),
      });

      const result = await service.register(rawDto);

      expect(result).toEqual({
        id: mockCreatedUser.id,
        email: expectedNormalizedEmail,
        emailVerifiedAt: null,
        createdAt: mockCreatedUser.createdAt,
      });
      expect(prismaMock.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if normalized email already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user-uuid' });

      await expect(service.register(rawDto)).rejects.toThrow(
        new ConflictException('An account with this email already exists'),
      );

      // Verify hashing and creation are never called
      expect(passwordHashingMock.hash).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('should handle Prisma P2002 unique constraint race condition and throw ConflictException', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['email'] },
        },
      );
      prismaMock.user.create.mockRejectedValue(p2002Error);

      await expect(service.register(rawDto)).rejects.toThrow(
        new ConflictException('An account with this email already exists'),
      );
    });

    it('should re-throw unrelated database errors without misclassifying them as conflict', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const dbError = new Error('Database connection failed');
      prismaMock.user.create.mockRejectedValue(dbError);

      await expect(service.register(rawDto)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('login', () => {
    const validLoginDto = {
      email: '  Researcher@Andemta.ET  ',
      password: 'ValidPassword123!',
    };
    const expectedNormalizedEmail = 'researcher@andemta.et';
    const verifiedDate = new Date('2026-11-14T10:00:00.000Z');

    const existingVerifiedUser = {
      id: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
      email: expectedNormalizedEmail,
      passwordHash: '$argon2id$v=19$valid_hash',
      emailVerifiedAt: verifiedDate,
    };

    it('should successfully log in with valid credentials, returning token and safe user representation', async () => {
      prismaMock.user.findUnique.mockResolvedValue(existingVerifiedUser);
      passwordHashingMock.verify.mockResolvedValue(true);

      const result = await service.login(validLoginDto);

      // 1. Email normalized for lookup
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: expectedNormalizedEmail },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          emailVerifiedAt: true,
        },
      });

      // 2. Password verified against Argon2id hash
      expect(passwordHashingMock.verify).toHaveBeenCalledWith(
        existingVerifiedUser.passwordHash,
        validLoginDto.password,
      );

      // 3. JWT generated with expected algorithm and options
      expect(jwtServiceMock.signAsync).toHaveBeenCalled();

      // 4. Return contract matches specification
      expect(result).toEqual({
        accessToken: 'mocked-signed-jwt-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: existingVerifiedUser.id,
          email: existingVerifiedUser.email,
          emailVerifiedAt: verifiedDate,
        },
      });

      // 5. No sensitive fields leaked
      expect(
        (result.user as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
      expect(
        (result as unknown as Record<string, unknown>).refreshToken,
      ).toBeUndefined();
    });

    it('should reject unknown email with generic UnauthorizedException and run dummy hash check to mitigate timing enumeration', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.login(validLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );

      // Verify dummy hash check was executed
      expect(passwordHashingMock.verify).toHaveBeenCalledWith(
        DUMMY_ARGON2_HASH,
        validLoginDto.password,
      );

      // Verify no JWT was signed
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject user with missing password hash (e.g. OAuth only) using dummy check and generic error', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'oauth-user-uuid',
        email: expectedNormalizedEmail,
        passwordHash: null,
        emailVerifiedAt: verifiedDate,
      });

      await expect(service.login(validLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );

      expect(passwordHashingMock.verify).toHaveBeenCalledWith(
        DUMMY_ARGON2_HASH,
        validLoginDto.password,
      );
      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject incorrect password with generic UnauthorizedException', async () => {
      prismaMock.user.findUnique.mockResolvedValue(existingVerifiedUser);
      passwordHashingMock.verify.mockResolvedValue(false);

      await expect(service.login(validLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject unverified user (emailVerifiedAt is null) with clear verification error', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...existingVerifiedUser,
        emailVerifiedAt: null,
      });
      passwordHashingMock.verify.mockResolvedValue(true);

      await expect(service.login(validLoginDto)).rejects.toThrow(
        new UnauthorizedException(
          'Email verification is required before logging in. Please check your inbox.',
        ),
      );

      expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    });

    it('should not create a Session database record or return a refresh token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(existingVerifiedUser);
      passwordHashingMock.verify.mockResolvedValue(true);

      const result = await service.login(validLoginDto);

      expect(
        (prismaMock as Record<string, unknown>).session,
      ).toBeUndefined();
      expect(
        (result as unknown as Record<string, unknown>).refreshToken,
      ).toBeUndefined();
      expect(
        (result as unknown as Record<string, unknown>).sessionId,
      ).toBeUndefined();
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a JWT access token with user ID in sub, unique JTI, configured issuer and audience', async () => {
      const userId = 'c1f7a049-74d1-4db8-b570-5b5832a52df4';

      const result = await service.generateAccessToken(userId);

      expect(result.accessToken).toBe('mocked-signed-jwt-access-token');
      expect(result.expiresIn).toBe(900);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: userId,
          jti: expect.any(String),
        }),
        expect.objectContaining({
          algorithm: 'HS256',
          expiresIn: '15m',
          issuer: 'andemta-api',
          audience: 'andemta-client',
        }),
      );
    });
  });
});
