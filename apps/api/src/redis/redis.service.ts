import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');

    const options: RedisOptions = {
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (process.env.NODE_ENV === 'test') {
          return null;
        }
        // Exponential backoff capped at 3000ms
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      reconnectOnError: (err) => {
        this.logger.warn(`Redis reconnecting on error: ${err.message}`);
        return true;
      },
    };

    this.client = new Redis(options);

    this.client.on('connect', () => {
      this.logger.log(`Redis connected to ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    // Initiate lazy connection without throwing uncaught startup errors
    this.client.connect().catch((err) => {
      this.logger.warn(
        `Initial Redis connection attempt failed: ${err.message}. Reconnect attempts will continue in background.`,
      );
    });
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Sends PING command to Redis and returns the response string ('PONG').
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Health check method returning true if Redis responds with PONG, false otherwise.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      this.logger.warn(
        `Redis health check probe failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client.status !== 'end') {
        await this.client.quit();
        this.logger.log('Redis client connection closed gracefully');
      }
    } catch (error) {
      this.logger.error(
        `Error closing Redis connection: ${(error as Error).message}`,
      );
      this.client.disconnect();
    }
  }
}

