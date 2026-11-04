import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let serviceMock: {
    checkLiveness: jest.Mock;
    checkReadiness: jest.Mock;
  };

  beforeEach(async () => {
    serviceMock = {
      checkLiveness: jest.fn().mockReturnValue({
        status: 'ok',
        timestamp: '2026-11-04T06:00:00.000Z',
        service: 'andemta-api',
        version: '0.1.0',
        uptime: 100,
        environment: 'test',
      }),
      checkReadiness: jest.fn().mockResolvedValue({
        isReady: true,
        failingDependencies: [],
        data: {
          status: 'ok',
          timestamp: '2026-11-04T06:00:00.000Z',
          service: 'andemta-api',
          version: '0.1.0',
          uptime: 100,
          environment: 'test',
          checks: {
            database: { status: 'up', responseTimeMs: 2 },
            redis: { status: 'up', responseTimeMs: 1 },
          },
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth (Liveness)', () => {
    it('should return operational status data from health service', () => {
      const result = controller.getHealth();

      expect(serviceMock.checkLiveness).toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('andemta-api');
      expect(result.version).toBe('0.1.0');
    });
  });

  describe('getReadiness', () => {
    it('should return readiness data when all dependencies are ready', async () => {
      const result = await controller.getReadiness();

      expect(serviceMock.checkReadiness).toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
    });

    it('should throw ServiceUnavailableException when one or more dependencies are unhealthy', async () => {
      serviceMock.checkReadiness.mockResolvedValue({
        isReady: false,
        failingDependencies: ['database'],
        data: {
          status: 'down',
          timestamp: '2026-11-04T06:00:00.000Z',
          service: 'andemta-api',
          version: '0.1.0',
          uptime: 100,
          environment: 'test',
          checks: {
            database: {
              status: 'down',
              responseTimeMs: 5,
              error: 'Connection refused',
            },
            redis: { status: 'up', responseTimeMs: 1 },
          },
        },
      });

      await expect(controller.getReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
