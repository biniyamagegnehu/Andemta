import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AUTH_CLEANUP_QUEUE,
  AUTH_CLEANUP_JOB,
} from '../constants/job.constants';
import {
  AuthCleanupService,
  CleanupResult,
} from '../../modules/auth/services/auth-cleanup.service';

export interface AuthCleanupJobData {
  retentionDays?: number;
}

@Processor(AUTH_CLEANUP_QUEUE)
export class AuthCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthCleanupProcessor.name);

  constructor(private readonly authCleanupService: AuthCleanupService) {
    super();
  }

  async process(job: Job<AuthCleanupJobData>): Promise<CleanupResult> {
    this.logger.log(
      `Processing background cleanup job: ${job.name} (id: ${job.id ?? 'unassigned'})`,
    );

    if (job.name !== AUTH_CLEANUP_JOB) {
      this.logger.warn(
        `Unexpected job name "${job.name}" encountered on queue ${AUTH_CLEANUP_QUEUE}`,
      );
    }

    const result = await this.authCleanupService.cleanExpiredRecords(
      job.data?.retentionDays,
    );

    this.logger.log(
      `Completed auth cleanup job: removed ${result.deletedSessions} sessions, ${result.deletedEmailVerificationTokens} email tokens, ${result.deletedPasswordResetTokens} reset tokens.`,
    );

    return result;
  }
}
