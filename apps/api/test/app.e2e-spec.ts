import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';

jest.setTimeout(60000);

describe('Andemta API (e2e)', () => {
  let app: INestApplication;
  let prismaMock: {
    $connect: jest.Mock;
    $disconnect: jest.Mock;
    checkHealth: jest.Mock;
  };
  let redisMock: {
    ping: jest.Mock;
    checkHealth: jest.Mock;
    getClient: jest.Mock;
    onModuleDestroy: jest.Mock;
  };

  beforeAll(async () => {
    prismaMock = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      checkHealth: jest.fn().mockResolvedValue(true),
    };

    redisMock = {
      ping: jest.fn().mockResolvedValue('PONG'),
      checkHealth: jest.fn().mockResolvedValue(true),
      getClient: jest.fn(),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(RedisService)
      .useValue(redisMock)
      .compile();

    app = moduleFixture.createNestApplication();

    // Replicate global pipeline exactly as configured in main.ts
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(createGlobalValidationPipe());
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TransformInterceptor(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    prismaMock.checkHealth.mockResolvedValue(true);
    redisMock.checkHealth.mockResolvedValue(true);
  });

  describe('Health Endpoints (Liveness & Readiness)', () => {
    it('GET /api/v1/health - should respond with 200 OK and standard success envelope (Liveness)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body).toEqual({
        success: true,
        message: 'Andemta API is healthy',
        data: expect.objectContaining({
          status: 'ok',
          service: 'andemta-api',
          version: '0.1.0',
        }),
        meta: null,
      });
    });

    it('GET /api/v1/health - should honor incoming safe X-Request-ID header', async () => {
      const customId = 'client-trace-id-12345';
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('x-request-id', customId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customId);
    });

    it('GET /api/v1/health/ready - should return 200 OK when PostgreSQL and Redis are both healthy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Andemta API infrastructure is ready',
        data: expect.objectContaining({
          status: 'ok',
          checks: {
            database: expect.objectContaining({ status: 'up' }),
            redis: expect.objectContaining({ status: 'up' }),
          },
        }),
        meta: null,
      });
    });

    it('GET /api/v1/health/ready - should return 503 Service Unavailable when PostgreSQL is down', async () => {
      prismaMock.checkHealth.mockResolvedValue(false);

      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('unavailable');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'database',
          }),
        ]),
      );
    });

    it('GET /api/v1/health/ready - should return 503 Service Unavailable when Redis is down', async () => {
      redisMock.checkHealth.mockResolvedValue(false);

      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'redis',
          }),
        ]),
      );
    });

    it('GET /api/health (without prefix) - should return 404 with standard error envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(404);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.success).toBe(false);
      expect(response.body.data).toBeNull();
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
  });

  describe('DTO Validation & Response Envelopes', () => {
    it('POST /api/v1/examples - should create entity and return 201 with standard envelope', async () => {
      const payload = {
        name: 'Abebe Bikila',
        email: 'abebe@andemta.et',
        role: 'participant',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/examples')
        .send(payload)
        .expect(201);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body).toEqual({
        success: true,
        message: 'Example resource created successfully',
        data: expect.objectContaining({
          name: 'Abebe Bikila',
          email: 'abebe@andemta.et',
          role: 'participant',
        }),
        meta: null,
      });
    });

    it('POST /api/v1/examples - should reject invalid DTO with 400 and detailed errors array', async () => {
      const invalidPayload = {
        name: '', // Empty name triggers MinLength / IsNotEmpty
        email: 'not-an-email',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/examples')
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Validation failed',
        data: null,
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'email' }),
        ]),
      });
    });

    it('POST /api/v1/examples - should reject unknown properties due to forbidNonWhitelisted', async () => {
      const payloadWithUnknown = {
        name: 'Valid Name',
        email: 'valid@andemta.et',
        hackedField: 'injection',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/examples')
        .send(payloadWithUnknown)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(
        response.body.errors.some((err: { field?: string; message: string }) =>
          err.message.includes('should not exist'),
        ),
      ).toBe(true);
    });

    it('GET /api/v1/examples - should return paginated envelope with meta object', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/examples')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Records retrieved successfully');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('GET /api/v1/examples/guarded - should pass BaseGuard and inject RequestId', async () => {
      const traceId = 'trace-id-guarded-test';
      const response = await request(app.getHttpServer())
        .get('/api/v1/examples/guarded')
        .set('x-request-id', traceId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.verifiedRequestId).toBe(traceId);
    });
  });
});
