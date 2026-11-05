import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHashingService } from './services/password-hashing.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let passwordHashingMock: {
    hash: jest.Mock;
    verify: jest.Mock;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordHashingService, useValue: passwordHashingMock },
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
});

