import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health status data from service', () => {
    const spy = jest.spyOn(service, 'check').mockReturnValue({
      status: 'ok',
      timestamp: '2026-11-02T12:00:00.000Z',
      service: 'andemta-api',
      version: '0.1.0',
      uptime: 100,
      environment: 'test',
    });

    const result = controller.getHealth();

    expect(spy).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('andemta-api');
    expect(result.version).toBe('0.1.0');
  });
});
