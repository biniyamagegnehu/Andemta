import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthCleanupService } from './auth-cleanup.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';

describe('AuthCleanupService', () => {
  let service: AuthCleanupService;
  let prismaMock: {
    session: {
      deleteMany: jest.Mock;
    };
    emailVerificationToken: {
      deleteMany: jest.Mock;
    };
    passwordResetToken: {
      deleteMany: jest.Mock;
    };
  };
  let redisClientMock: {
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      session: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      emailVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    redisClientMock = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCleanupService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: any) => def),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(redisClientMock),
          },
        },
      ],
    }).compile();

    service = module.get<AuthCleanupService>(AuthCleanupService);
  });

  it('should clean expired/revoked sessions and tokens', async () => {
    const result = await service.cleanExpiredRecords(30);

    expect(result.deletedSessions).toBe(5);
    expect(result.deletedEmailVerificationTokens).toBe(3);
    expect(result.deletedPasswordResetTokens).toBe(2);
    expect(prismaMock.session.deleteMany).toHaveBeenCalled();
    expect(prismaMock.emailVerificationToken.deleteMany).toHaveBeenCalled();
    expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalled();
    expect(redisClientMock.del).toHaveBeenCalled();
  });

  it('should skip cleanup if another instance holds the lock', async () => {
    redisClientMock.set.mockResolvedValue(null);

    const result = await service.cleanExpiredRecords(30);

    expect(result.deletedSessions).toBe(0);
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });
});
