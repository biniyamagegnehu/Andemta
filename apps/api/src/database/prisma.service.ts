import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL connection established via Prisma');
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

