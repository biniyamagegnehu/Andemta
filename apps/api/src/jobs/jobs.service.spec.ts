import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { JobsService } from './jobs.service';
import {
  INFRASTRUCTURE_PING_QUEUE,
  INFRASTRUCTURE_PING_JOB,
} from './constants/job.constants';

describe('JobsService', () => {
  let service: JobsService;
  let queueMock: {
    add: jest.Mock;
    getWaitingCount: jest.Mock;
    getActiveCount: jest.Mock;
    getCompletedCount: jest.Mock;
    getFailedCount: jest.Mock;
    getDelayedCount: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-999' }),
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(10),
      getFailedCount: jest.fn().mockResolvedValue(0),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      count: jest.fn().mockResolvedValue(11),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getQueueToken(INFRASTRUCTURE_PING_QUEUE),
          useValue: queueMock,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPingJob', () => {
    it('should enqueue job with retry and retention settings', async () => {
      const job = await service.addPingJob({ message: 'Hello BullMQ' });

      expect(queueMock.add).toHaveBeenCalledWith(
        INFRASTRUCTURE_PING_JOB,
        expect.objectContaining({ message: 'Hello BullMQ' }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 100, age: 3600 },
          removeOnFail: { count: 100, age: 86400 },
        }),
      );
      expect(job.id).toBe('job-999');
    });
  });

  describe('getQueueMetrics', () => {
    it('should aggregate metrics from queue state counters', async () => {
      const metrics = await service.getQueueMetrics();

      expect(metrics).toEqual({
        waiting: 1,
        active: 0,
        completed: 10,
        failed: 0,
        delayed: 0,
      });
    });
  });

  describe('checkHealth', () => {
    it('should return true when queue is reachable', async () => {
      const healthy = await service.checkHealth();
      expect(healthy).toBe(true);
    });

    it('should return false when queue counter rejects', async () => {
      queueMock.count.mockRejectedValue(new Error('Redis disconnected'));

      const healthy = await service.checkHealth();
      expect(healthy).toBe(false);
    });
  });
});

