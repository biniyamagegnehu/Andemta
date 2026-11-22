import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'database.url')
                return 'postgresql://postgres:password@localhost:5432/andemta_dev';
              if (key === 'database.queryTimeoutMs') return 30000;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to database and apply query timeout without throwing', async () => {
      const connectSpy = jest
        .spyOn(service, '$connect')
        .mockResolvedValue(undefined);
      const executeRawSpy = jest
        .spyOn(service, '$executeRawUnsafe')
        .mockResolvedValue(1);

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(connectSpy).toHaveBeenCalled();
      expect(executeRawSpy).toHaveBeenCalledWith(
        'SET statement_timeout = 30000;',
      );
    });

    it('should catch and log startup connection failure without crashing application', async () => {
      jest
        .spyOn(service, '$connect')
        .mockRejectedValue(new Error('Connection refused'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect gracefully', async () => {
      const disconnectSpy = jest
        .spyOn(service, '$disconnect')
        .mockResolvedValue(undefined);

      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    it('should return true when SELECT 1 succeeds', async () => {
      jest.spyOn(service, '$queryRaw').mockResolvedValue([{ 1: 1 }]);

      const result = await service.checkHealth();
      expect(result).toBe(true);
    });

    it('should return false when query fails', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValue(new Error('Query timeout'));

      const result = await service.checkHealth();
      expect(result).toBe(false);
    });
  });
});

