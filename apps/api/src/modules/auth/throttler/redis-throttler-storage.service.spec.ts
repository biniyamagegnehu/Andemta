import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler-storage.service';
import { RedisService } from '../../../redis/redis.service';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let redisClientMock: {
    eval: jest.Mock;
    status: string;
  };
  let redisServiceMock: {
    getClient: jest.Mock;
  };

  beforeEach(() => {
    redisClientMock = {
      eval: jest.fn().mockResolvedValue([1, 60, 0, 0]),
      status: 'ready',
    };

    redisServiceMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };

    storage = new RedisThrottlerStorage(
      redisServiceMock as unknown as RedisService,
      { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService,
    );
  });

  it('should increment via Redis Lua script and return storage record', async () => {
    redisClientMock.eval.mockResolvedValue([2, 55, 0, 0]);

    const result = await storage.increment('ip-1.2.3.4', 60000, 10, 60000, 'default');

    expect(result).toEqual({
      totalHits: 2,
      timeToExpire: 55,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(redisClientMock.eval).toHaveBeenCalled();
  });

  it('should fall back to in-memory rate limiting when Redis fails and failClosed is false', async () => {
    redisClientMock.eval.mockRejectedValue(new Error('Redis connection lost'));

    const result = await storage.increment('ip-1.2.3.4', 60000, 2, 60000, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);

    // Second hit in memory
    const result2 = await storage.increment('ip-1.2.3.4', 60000, 2, 60000, 'default');
    expect(result2.totalHits).toBe(2);
    expect(result2.isBlocked).toBe(false);

    // Third hit exceeds limit of 2 -> should block
    const result3 = await storage.increment('ip-1.2.3.4', 60000, 2, 60000, 'default');
    expect(result3.isBlocked).toBe(true);
  });

  it('should throw ServiceUnavailableException when Redis fails and failClosed is true', async () => {
    const failClosedStorage = new RedisThrottlerStorage(
      redisServiceMock as unknown as RedisService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    redisClientMock.eval.mockRejectedValue(new Error('Redis connection lost'));

    await expect(
      failClosedStorage.increment('ip-1.2.3.4', 60000, 10, 60000, 'default'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
