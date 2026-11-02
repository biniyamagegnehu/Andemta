import { Test, TestingModule } from '@nestjs/testing';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

describe('ExampleController', () => {
  let controller: ExampleController;
  let service: ExampleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExampleController],
      providers: [ExampleService],
    }).compile();

    controller = module.get<ExampleController>(ExampleController);
    service = module.get<ExampleService>(ExampleService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('should create an example entity using service', () => {
    const dto = {
      name: 'Test Consumer',
      email: 'consumer@example.com',
      role: 'participant',
    };

    const result = controller.create(dto);
    expect(result).toBeDefined();
    expect(result.name).toBe('Test Consumer');
    expect(result.email).toBe('consumer@example.com');
  });

  it('should return paginated records', () => {
    const result = controller.findAll();
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.meta.page).toBe(1);
  });

  it('should return guarded result with correlated request ID', () => {
    const result = controller.findGuarded('req-test-999');
    expect(result.verifiedRequestId).toBe('req-test-999');
    expect(result.message).toContain('Guarded');
  });
});

