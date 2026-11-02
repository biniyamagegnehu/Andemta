import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return operational status details', () => {
    const health = service.check();
    expect(health).toBeDefined();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('andemta-api');
    expect(health.version).toBe('0.1.0');
    expect(typeof health.uptime).toBe('number');
    expect(typeof health.timestamp).toBe('string');
  });
});

