import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';

jest.setTimeout(60000);

describe('Authentication — User Registration (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // Mock RedisService so test relies solely on PostgreSQL database
    const redisMock = {
      ping: jest.fn().mockResolvedValue('PONG'),
      checkHealth: jest.fn().mockResolvedValue(true),
      getClient: jest.fn(),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up all integration test users from PostgreSQL
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    const testEmail = `test-integration-${Date.now()}@andemta.et`;
    const testPassword = 'SecureEthiopiaPass123!';
    let registeredUserId: string;

    it('should register a new user, return 201 Created with safe fields and no password data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body).toEqual({
        success: true,
        message: 'User registered successfully',
        data: expect.objectContaining({
          id: expect.any(String),
          email: testEmail,
          emailVerifiedAt: null,
          createdAt: expect.any(String),
        }),
        meta: null,
      });

      registeredUserId = response.body.data.id;
      createdUserIds.push(registeredUserId);

      // Verify no sensitive fields leak in HTTP response
      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.passwordHash).toBeUndefined();
      expect(response.body.data.refreshTokenHash).toBeUndefined();
    });

    it('should verify created user exists in PostgreSQL with Argon2id hash and no session', async () => {
      const dbUser = await prisma.user.findUnique({
        where: { id: registeredUserId },
      });

      expect(dbUser).toBeDefined();
      expect(dbUser?.email).toBe(testEmail);
      expect(dbUser?.emailVerifiedAt).toBeNull();

      // Verify stored passwordHash is an Argon2id hash and not plaintext
      expect(dbUser?.passwordHash).toBeDefined();
      expect(dbUser?.passwordHash).not.toBe(testPassword);
      expect(dbUser?.passwordHash?.startsWith('$argon2id$v=19$')).toBe(true);

      // Verify stored hash verifies successfully against submitted password
      const isValid = await argon2.verify(dbUser!.passwordHash!, testPassword);
      expect(isValid).toBe(true);

      // Verify no Session record was created
      const sessionCount = await prisma.session.count({
        where: { userId: registeredUserId },
      });
      expect(sessionCount).toBe(0);

      // Verify no EmailVerificationToken record was created
      const tokenCount = await prisma.emailVerificationToken.count({
        where: { userId: registeredUserId },
      });
      expect(tokenCount).toBe(0);
    });

    it('should reject duplicate normalized email with 409 Conflict', async () => {
      // Send same email with surrounding whitespace and mixed uppercase
      const duplicateVariant = `  ${testEmail.toUpperCase()}  `;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: duplicateVariant,
          password: 'AnotherValidPassword123!',
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'An account with this email already exists',
        data: null,
        errors: [],
      });
    });

    it('should reject registration when password is shorter than 12 characters (400 Bad Request)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `test-short-${Date.now()}@andemta.et`,
          password: 'Short123!', // 9 chars
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: expect.stringContaining('at least 12 characters'),
          }),
        ]),
      );
    });

    it('should reject registration when email is invalid (400 Bad Request)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: testPassword,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('valid email address'),
          }),
        ]),
      );
    });

    it('should reject unexpected request properties due to forbidNonWhitelisted (400 Bad Request)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `test-extra-${Date.now()}@andemta.et`,
          password: testPassword,
          role: 'ADMIN', // Non-whitelisted field
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(
        response.body.errors.some((err: { field?: string; message: string }) =>
          err.message.includes('should not exist'),
        ),
      ).toBe(true);
    });
  });
});

