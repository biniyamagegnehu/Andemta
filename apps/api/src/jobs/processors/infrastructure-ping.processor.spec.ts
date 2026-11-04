import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import {
  InfrastructurePingProcessor,
  PingJobData,
} from './infrastructure-ping.processor';
import { INFRASTRUCTURE_PING_JOB } from '../constants/job.constants';

describe('InfrastructurePingProcessor', () => {
  let processor: InfrastructurePingProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InfrastructurePingProcessor],
    }).compile();

    processor = module.get<InfrastructurePingProcessor>(
      InfrastructurePingProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process infrastructure ping job and return success result', async () => {
    const mockJob = {
      id: 'job-12345',
      name: INFRASTRUCTURE_PING_JOB,
      data: {
        message: 'Test ping job',
        enqueuedAt: '2026-11-04T06:00:00.000Z',
      },
    } as unknown as Job<PingJobData>;

    const result = await processor.process(mockJob);

    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.jobId).toBe('job-12345');
    expect(result.payload.message).toBe('Test ping job');
    expect(typeof result.processedAt).toBe('string');
  });
});

