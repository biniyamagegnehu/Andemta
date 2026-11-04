import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaMock: { checkHealth: jest.Mock };
  let redisMock: { checkHealth: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      checkHealth: jest.fn().mockResolvedValue(true),
    };
    redisMock = {
      checkHealth: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkLiveness', () => {
    it('should return operational status details immediately without contacting services', () => {
      const health = service.checkLiveness();
      expect(health).toBeDefined();
      expect(health.status).toBe('ok');
      expect(health.service).toBe('andemta-api');
      expect(health.version).toBe('0.1.0');
      expect(typeof health.uptime).toBe('number');
      expect(typeof health.timestamp).toBe('string');
      expect(prismaMock.checkHealth).not.toHaveBeenCalled();
      expect(redisMock.checkHealth).not.toHaveBeenCalled();
    });
  });

  describe('checkReadiness', () => {
    it('should return isReady=true when PostgreSQL and Redis are both healthy', async () => {
      prismaMock.checkHealth.mockResolvedValue(true);
      redisMock.checkHealth.mockResolvedValue(true);

      const result = await service.checkReadiness();

      expect(result.isReady).toBe(true);
      expect(result.failingDependencies).toHaveLength(0);
      expect(result.data.status).toBe('ok');
      expect(result.data.checks.database.status).toBe('up');
      expect(result.data.checks.redis.status).toBe('up');
      expect(typeof result.data.checks.database.responseTimeMs).toBe('number');
      expect(typeof result.data.checks.redis.responseTimeMs).toBe('number');
    });

    it('should return isReady=false and flag database when PostgreSQL fails', async () => {
      prismaMock.checkHealth.mockResolvedValue(false);
      redisMock.checkHealth.mockResolvedValue(true);

      const result = await service.checkReadiness();

      expect(result.isReady).toBe(false);
      expect(result.failingDependencies).toEqual(['database']);
      expect(result.data.status).toBe('down');
      expect(result.data.checks.database.status).toBe('down');
      expect(result.data.checks.redis.status).toBe('up');
    });

    it('should return isReady=false and flag redis when Redis fails', async () => {
      prismaMock.checkHealth.mockResolvedValue(true);
      redisMock.checkHealth.mockResolvedValue(false);

      const result = await service.checkReadiness();

      expect(result.isReady).toBe(false);
      expect(result.failingDependencies).toEqual(['redis']);
      expect(result.data.status).toBe('down');
      expect(result.data.checks.database.status).toBe('up');
      expect(result.data.checks.redis.status).toBe('down');
    });

    it('should handle unhandled exceptions from providers gracefully without throwing', async () => {
      prismaMock.checkHealth.mockRejectedValue(new Error('Connection timeout'));
      redisMock.checkHealth.mockRejectedValue(new Error('Socket closed'));

      const result = await service.checkReadiness();

      expect(result.isReady).toBe(false);
      expect(result.failingDependencies).toContain('database');
      expect(result.failingDependencies).toContain('redis');
      expect(result.data.checks.database.error).toBe('Connection timeout');
      expect(result.data.checks.redis.error).toBe('Socket closed');
    });
  });
});
