import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../../redis/redis.service';

interface InMemoryRecord {
  totalHits: number;
  expiresAt: number;
  isBlocked: boolean;
  blockExpiresAt: number;
}

const LUA_THROTTLE_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local blockKey = key .. ':blocked'
local isBlocked = redis.call('get', blockKey)
if isBlocked then
  local pttl = redis.call('pttl', blockKey)
  local timeToBlockExpire = math.max(0, math.ceil(pttl / 1000))
  return {limit + 1, 0, 1, timeToBlockExpire}
end

local hits = redis.call('incr', key)
if hits == 1 then
  redis.call('pexpire', key, ttl)
end

local pttl = redis.call('pttl', key)
local timeToExpire = math.max(0, math.ceil(pttl / 1000))

if hits > limit then
  local blockMs = (blockDuration > 0) and blockDuration or ttl
  redis.call('set', blockKey, '1', 'PX', blockMs)
  local timeToBlockExpire = math.max(0, math.ceil(blockMs / 1000))
  return {hits, timeToExpire, 1, timeToBlockExpire}
end

return {hits, timeToExpire, 0, 0}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly inMemoryFallback = new Map<string, InMemoryRecord>();
  private readonly keyPrefix = 'rl:auth:';
  private readonly failClosed: boolean;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService?: ConfigService,
  ) {
    this.failClosed =
      this.configService?.get<boolean>('rateLimit.failClosed') ?? false;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const namespacedKey = `${this.keyPrefix}${throttlerName}:${key}`;
    const now = Date.now();

    try {
      const client = this.redisService.getClient();
      // Ensure Redis client is ready / not completely dead
      if (!client || client.status === 'end' || client.status === 'close') {
        throw new Error(`Redis client status is ${client.status}`);
      }

      const result = (await client.eval(
        LUA_THROTTLE_SCRIPT,
        1,
        namespacedKey,
        ttl,
        limit,
        blockDuration,
        now,
      )) as [number, number, number, number];

      const [totalHits, timeToExpire, isBlockedNum, timeToBlockExpire] = result;

      return {
        totalHits: Number(totalHits),
        timeToExpire: Number(timeToExpire),
        isBlocked: Number(isBlockedNum) === 1,
        timeToBlockExpire: Number(timeToBlockExpire),
      };
    } catch (error) {
      this.logger.warn(
        `Redis rate limiting unavailable (${(error as Error).message}). Applying failure policy.`,
      );

      if (this.failClosed) {
        throw new ServiceUnavailableException(
          'Rate limiting service is temporarily unavailable. Please try again shortly.',
        );
      }

      // Secure in-memory fallback: ensures rate limiting continues even during Redis outages
      return this.incrementInMemory(namespacedKey, ttl, limit, blockDuration, now);
    }
  }

  private incrementInMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    now: number,
  ): ThrottlerStorageRecord {
    let record = this.inMemoryFallback.get(key);

    if (!record || now >= record.expiresAt) {
      record = {
        totalHits: 0,
        expiresAt: now + ttl,
        isBlocked: false,
        blockExpiresAt: 0,
      };
      this.inMemoryFallback.set(key, record);
    }

    if (record.isBlocked) {
      if (now >= record.blockExpiresAt) {
        record.isBlocked = false;
        record.totalHits = 0;
        record.expiresAt = now + ttl;
        record.blockExpiresAt = 0;
      } else {
        const timeToBlockExpire = Math.max(
          0,
          Math.ceil((record.blockExpiresAt - now) / 1000),
        );
        return {
          totalHits: limit + 1,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire,
        };
      }
    }

    record.totalHits += 1;
    const timeToExpire = Math.max(0, Math.ceil((record.expiresAt - now) / 1000));

    if (record.totalHits > limit) {
      const blockMs = blockDuration > 0 ? blockDuration : ttl;
      record.isBlocked = true;
      record.blockExpiresAt = now + blockMs;
      const timeToBlockExpire = Math.max(0, Math.ceil(blockMs / 1000));
      return {
        totalHits: record.totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    return {
      totalHits: record.totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
