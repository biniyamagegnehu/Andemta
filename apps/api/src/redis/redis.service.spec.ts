import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

const mockRedisInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
  status: 'ready',
};

jest.mock('ioredis', () => {
  const mRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  return {
    __esModule: true,
    default: mRedis,
    Redis: mRedis,
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockRedisInstance.status = 'ready';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'redis.host') return 'localhost';
              if (key === 'redis.port') return 6379;
              if (key === 'redis.password') return undefined;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined and initialized with config', () => {
    expect(service).toBeDefined();
    expect(configService.get).toHaveBeenCalledWith('redis.host', 'localhost');
    expect(configService.get).toHaveBeenCalledWith('redis.port', 6379);
  });

  describe('ping', () => {
    it('should return PONG from Redis client', async () => {
      const result = await service.ping();
      expect(result).toBe('PONG');
    });
  });

  describe('checkHealth', () => {
    it('should return true when Redis ping returns PONG', async () => {
      const result = await service.checkHealth();
      expect(result).toBe(true);
    });

    it('should return false when Redis ping throws', async () => {
      mockRedisInstance.ping.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await service.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis connection gracefully', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
