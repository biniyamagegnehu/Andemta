import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
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
    it('should connect to database without throwing', async () => {
      const connectSpy = jest
        .spyOn(service, '$connect')
        .mockResolvedValue(undefined);

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(connectSpy).toHaveBeenCalled();
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

