import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import {
  INFRASTRUCTURE_PING_QUEUE,
  INFRASTRUCTURE_PING_JOB,
  AUTH_CLEANUP_QUEUE,
  AUTH_CLEANUP_JOB,
} from './constants/job.constants';
import { PingJobData, PingJobResult } from './processors/infrastructure-ping.processor';
import { AuthCleanupJobData } from './processors/auth-cleanup.processor';
import { CleanupResult } from '../modules/auth/services/auth-cleanup.service';

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(INFRASTRUCTURE_PING_QUEUE)
    private readonly pingQueue: Queue<PingJobData, PingJobResult>,
    @InjectQueue(AUTH_CLEANUP_QUEUE)
    private readonly cleanupQueue: Queue<AuthCleanupJobData, CleanupResult>,
  ) {}

  /**
   * Enqueues a demonstration infrastructure ping job with default retry and retention policies.
   */
  async addPingJob(
    data: PingJobData = {},
  ): Promise<Job<PingJobData, PingJobResult>> {
    const enrichedData: PingJobData = {
      message: data.message || 'Infrastructure connectivity check',
      enqueuedAt: data.enqueuedAt || new Date().toISOString(),
    };

    const job = await this.pingQueue.add(
      INFRASTRUCTURE_PING_JOB,
      enrichedData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 100,
          age: 3600, // 1 hour
        },
        removeOnFail: {
          count: 100,
          age: 86400, // 24 hours
        },
      },
    );

    this.logger.log(`Enqueued ping job with ID: ${job.id}`);
    return job;
  }

  /**
   * Enqueues a scheduled or on-demand authentication session and token cleanup job.
   */
  async addAuthCleanupJob(
    data: AuthCleanupJobData = {},
  ): Promise<Job<AuthCleanupJobData, CleanupResult>> {
    const job = await this.cleanupQueue.add(AUTH_CLEANUP_JOB, data, {
      attempts: 2,
      removeOnComplete: {
        count: 50,
        age: 86400, // 24 hours
      },
      removeOnFail: {
        count: 50,
        age: 86400 * 7, // 7 days
      },
    });

    this.logger.log(`Enqueued auth cleanup job with ID: ${job.id}`);
    return job;
  }

  /**
   * Retrieves current job count metrics across states for the demonstration queue.
   */
  async getQueueMetrics(): Promise<QueueMetrics> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.pingQueue.getWaitingCount(),
      this.pingQueue.getActiveCount(),
      this.pingQueue.getCompletedCount(),
      this.pingQueue.getFailedCount(),
      this.pingQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Safe readiness probe for the job queue.
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.pingQueue.count();
      return true;
    } catch (error) {
      this.logger.warn(
        `BullMQ queue health check failed: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
