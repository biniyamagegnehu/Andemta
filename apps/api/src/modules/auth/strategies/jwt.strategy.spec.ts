import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../database/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
    };
  };
  let configServiceMock: {
    get: jest.Mock;
  };

  const strongSecret = 'super-secret-key-at-least-32-chars-long-for-testing';

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret') return strongSecret;
        if (key === 'jwt.issuer') return 'andemta-api';
        if (key === 'jwt.audience') return 'andemta-client';
        return undefined;
      }),
    };

    strategy = new JwtStrategy(
      configServiceMock as unknown as ConfigService,
      prismaMock as unknown as PrismaService,
    );
  });

  it('should throw an error during initialization if secret is missing or less than 32 characters', () => {
    const invalidConfigMock = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret') return 'short-secret';
        return undefined;
      }),
    };

    expect(
      () =>
        new JwtStrategy(
          invalidConfigMock as unknown as ConfigService,
          prismaMock as unknown as PrismaService,
        ),
    ).toThrow('JWT_ACCESS_SECRET must be at least 32 characters long');
  });

  it('should successfully validate payload and return safe authenticated user object', async () => {
    const verifiedDate = new Date('2026-11-14T10:00:00.000Z');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
      email: 'researcher@andemta.et',
      emailVerifiedAt: verifiedDate,
      passwordHash: 'secret-hash-should-not-be-returned',
    });

    const payload = {
      sub: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
      jti: 'f1f2f3f4',
      iss: 'andemta-api',
      aud: 'andemta-client',
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      id: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
      email: 'researcher@andemta.et',
      emailVerifiedAt: verifiedDate,
    });
    expect(
      (result as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1f7a049-74d1-4db8-b570-5b5832a52df4' },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });
  });

  it('should reject malformed payload that is null or not an object', async () => {
    await expect(strategy.validate(null)).rejects.toThrow(
      new UnauthorizedException('Malformed token payload'),
    );
    await expect(strategy.validate('string-not-object')).rejects.toThrow(
      new UnauthorizedException('Malformed token payload'),
    );
  });

  it('should reject payload with missing or invalid sub claim', async () => {
    await expect(strategy.validate({ jti: 'some-id' })).rejects.toThrow(
      new UnauthorizedException('Invalid token subject claim'),
    );
    await expect(strategy.validate({ sub: 12345 })).rejects.toThrow(
      new UnauthorizedException('Invalid token subject claim'),
    );
  });

  it('should reject when user does not exist in database', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'nonexistent-uuid' }),
    ).rejects.toThrow(new UnauthorizedException('User account no longer exists'));
  });

  it('should reject when user email is not verified (emailVerifiedAt is null)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'unverified-uuid',
      email: 'unverified@andemta.et',
      emailVerifiedAt: null,
    });

    await expect(
      strategy.validate({ sub: 'unverified-uuid' }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Email verification is required to access this resource',
      ),
    );
  });
});
