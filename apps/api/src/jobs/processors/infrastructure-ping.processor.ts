import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  INFRASTRUCTURE_PING_QUEUE,
  INFRASTRUCTURE_PING_JOB,
} from '../constants/job.constants';

export interface PingJobData {
  message?: string;
  enqueuedAt?: string;
}

export interface PingJobResult {
  status: string;
  jobId: string;
  processedAt: string;
  payload: PingJobData;
}

@Processor(INFRASTRUCTURE_PING_QUEUE)
export class InfrastructurePingProcessor extends WorkerHost {
  private readonly logger = new Logger(InfrastructurePingProcessor.name);

  async process(job: Job<PingJobData>): Promise<PingJobResult> {
    this.logger.log(
      `Processing background job: ${job.name} (id: ${job.id ?? 'unassigned'})`,
    );

    if (job.name !== INFRASTRUCTURE_PING_JOB) {
      this.logger.warn(
        `Unexpected job name "${job.name}" encountered on queue ${INFRASTRUCTURE_PING_QUEUE}`,
      );
    }

    const result: PingJobResult = {
      status: 'completed',
      jobId: job.id ?? 'unassigned',
      processedAt: new Date().toISOString(),
      payload: job.data || {},
    };

    this.logger.log(
      `Successfully processed ${job.name} job (id: ${job.id ?? 'unassigned'})`,
    );

    return result;
  }
}
