import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface LivenessData {
  status: 'ok';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  environment: string;
}

// Backward-compatibility alias
export type HealthData = LivenessData;

export type DependencyState = 'up' | 'down';

export interface DependencyCheck {
  status: DependencyState;
  responseTimeMs: number;
  error?: string;
}

export interface ReadinessData {
  status: 'ok' | 'down';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
  };
}

export interface ReadinessCheckResult {
  isReady: boolean;
  data: ReadinessData;
  failingDependencies: string[];
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Liveness probe: returns immediate process state without touching dependencies.
   */
  checkLiveness(): LivenessData {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'andemta-api',
      version: '0.1.0',
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Backward-compatible alias for checkLiveness().
   */
  check(): LivenessData {
    return this.checkLiveness();
  }

  /**
   * Readiness probe: actively verifies PostgreSQL and Redis responsiveness.
   */
  async checkReadiness(): Promise<ReadinessCheckResult> {
    const failingDependencies: string[] = [];

    // Probe Database (PostgreSQL)
    const dbStart = Date.now();
    let dbStatus: DependencyState = 'down';
    let dbError: string | undefined;

    try {
      const isDbHealthy = await this.prisma.checkHealth();
      if (isDbHealthy) {
        dbStatus = 'up';
      } else {
        dbError = 'Database probe query failed';
        failingDependencies.push('database');
      }
    } catch (err) {
      dbError = (err as Error).message;
      failingDependencies.push('database');
    }
    const dbResponseTimeMs = Date.now() - dbStart;

    // Probe Redis
    const redisStart = Date.now();
    let redisStatus: DependencyState = 'down';
    let redisError: string | undefined;

    try {
      const isRedisHealthy = await this.redis.checkHealth();
      if (isRedisHealthy) {
        redisStatus = 'up';
      } else {
        redisError = 'Redis PING failed to return PONG';
        failingDependencies.push('redis');
      }
    } catch (err) {
      redisError = (err as Error).message;
      failingDependencies.push('redis');
    }
    const redisResponseTimeMs = Date.now() - redisStart;

    const isReady = failingDependencies.length === 0;

    const data: ReadinessData = {
      status: isReady ? 'ok' : 'down',
      timestamp: new Date().toISOString(),
      service: 'andemta-api',
      version: '0.1.0',
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: dbStatus,
          responseTimeMs: dbResponseTimeMs,
          ...(dbError ? { error: dbError } : {}),
        },
        redis: {
          status: redisStatus,
          responseTimeMs: redisResponseTimeMs,
          ...(redisError ? { error: redisError } : {}),
        },
      },
    };

    if (!isReady) {
      this.logger.warn(
        `Readiness check failed for: ${failingDependencies.join(', ')}`,
      );
    }

    return {
      isReady,
      data,
      failingDependencies,
    };
  }
}
