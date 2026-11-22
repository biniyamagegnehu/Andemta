import { UnauthorizedException } from '@nestjs/common';
import { AccountLockoutService } from './account-lockout.service';
import { RedisService } from '../../../redis/redis.service';

describe('AccountLockoutService', () => {
  let service: AccountLockoutService;
  let redisClientMock: {
    hgetall: jest.Mock;
    hincrby: jest.Mock;
    hset: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };
  let redisServiceMock: {
    getClient: jest.Mock;
  };

  beforeEach(() => {
    redisClientMock = {
      hgetall: jest.fn().mockResolvedValue({}),
      hincrby: jest.fn().mockResolvedValue(1),
      hset: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };

    redisServiceMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };

    service = new AccountLockoutService(redisServiceMock as unknown as RedisService);
  });

  describe('checkLockout', () => {
    it('should allow login attempt if account is not locked', async () => {
      redisClientMock.hgetall.mockResolvedValue({});

      await expect(
        service.checkLockout('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should throw UnauthorizedException if account is locked', async () => {
      const lockedUntil = Date.now() + 60000;
      redisClientMock.hgetall.mockResolvedValue({
        attempts: '5',
        lockedUntil: String(lockedUntil),
      });

      await expect(service.checkLockout('user@example.com')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should allow login if previous lockout has expired', async () => {
      const expiredLock = Date.now() - 1000;
      redisClientMock.hgetall.mockResolvedValue({
        attempts: '5',
        lockedUntil: String(expiredLock),
      });

      await expect(
        service.checkLockout('user@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempts and not lock when below threshold', async () => {
      redisClientMock.hincrby.mockResolvedValue(3);

      await service.recordFailedAttempt('user@example.com');

      expect(redisClientMock.hincrby).toHaveBeenCalled();
      expect(redisClientMock.hset).not.toHaveBeenCalled();
      expect(redisClientMock.expire).toHaveBeenCalled();
    });

    it('should apply 1-minute restriction on 5 failed attempts', async () => {
      redisClientMock.hincrby.mockResolvedValue(5);

      await service.recordFailedAttempt('user@example.com');

      expect(redisClientMock.hset).toHaveBeenCalledWith(
        expect.any(String),
        'lockedUntil',
        expect.any(String),
      );
    });

    it('should apply 5-minute restriction on 6-9 failed attempts', async () => {
      redisClientMock.hincrby.mockResolvedValue(7);

      await service.recordFailedAttempt('user@example.com');

      expect(redisClientMock.hset).toHaveBeenCalled();
    });

    it('should apply bounded 15-minute restriction on 10+ failed attempts', async () => {
      redisClientMock.hincrby.mockResolvedValue(12);

      await service.recordFailedAttempt('user@example.com');

      expect(redisClientMock.hset).toHaveBeenCalled();
    });

    it('should fall back to in-memory tracking if Redis throws an error', async () => {
      redisClientMock.hincrby.mockRejectedValue(new Error('Redis offline'));

      // Should not throw, should handle safely
      await expect(
        service.recordFailedAttempt('user@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resetLockout', () => {
    it('should delete the lockout key in Redis', async () => {
      await service.resetLockout('user@example.com');

      expect(redisClientMock.del).toHaveBeenCalled();
    });
  });
});
