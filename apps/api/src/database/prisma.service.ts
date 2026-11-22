import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly queryTimeoutMs: number;

  constructor(@Optional() private readonly configService?: ConfigService) {
    const rawUrl = configService?.get<string>('database.url');
    const queryTimeoutMs = configService?.get<number>(
      'database.queryTimeoutMs',
      30000,
    ) ?? 30000;

    // Append statement_timeout parameter to PostgreSQL URL if not already specified
    let urlWithTimeout = rawUrl;
    if (rawUrl && !rawUrl.includes('statement_timeout')) {
      const separator = rawUrl.includes('?') ? '&' : '?';
      urlWithTimeout = `${rawUrl}${separator}statement_timeout=${queryTimeoutMs}`;
    }

    super(
      urlWithTimeout
        ? {
            datasources: {
              db: {
                url: urlWithTimeout,
              },
            },
          }
        : undefined,
    );

    this.queryTimeoutMs = queryTimeoutMs;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // Apply session statement timeout for all subsequent queries on this connection pool
      await this.$executeRawUnsafe(
        `SET statement_timeout = ${this.queryTimeoutMs};`,
      );
      this.logger.log(
        `PostgreSQL connection established via Prisma (${this.queryTimeoutMs}ms query timeout configured)`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to connect to PostgreSQL on startup: ${(error as Error).message}. Service will retry on query.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('PostgreSQL connection closed gracefully');
    } catch (error) {
      this.logger.error(
        `Error disconnecting from PostgreSQL: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Safe connectivity check executing a lightweight query.
   * Returns true if database is accessible and responding, false otherwise.
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(
        `PostgreSQL health check probe failed: ${(error as Error).message}`,
      );
      return false;
    }
  }
}

