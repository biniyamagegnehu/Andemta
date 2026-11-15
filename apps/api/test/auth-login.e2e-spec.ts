import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  EMAIL_PROVIDER,
  SendVerificationEmailOptions,
} from '../src/modules/email/interfaces/email-provider.interface';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';
import { JwtService } from '@nestjs/jwt';

jest.setTimeout(60000);

describe('Authentication — Login & Access Tokens (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdUserIds: string[] = [];

  const dispatchedEmails: SendVerificationEmailOptions[] = [];
  const mockEmailProvider = {
    sendVerificationEmail: jest.fn(
      async (options: SendVerificationEmailOptions) => {
        dispatchedEmails.push(options);
      },
    ),
  };

  beforeAll(async () => {
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
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(mockEmailProvider)
      .compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(createGlobalValidationPipe());
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TransformInterceptor(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    dispatchedEmails.length = 0;
    mockEmailProvider.sendVerificationEmail.mockClear();
  });

  describe('Full Authentication Flow: Register -> Verify -> Login -> Access Protected Route', () => {
    it('should allow a verified user to log in, obtain a JWT access token, and access GET /api/v1/auth/me', async () => {
      const email = `login-test-${Date.now()}@andemta.et`;
      const password = 'StrongPassword123!';

      // 1. Register a new user
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password })
        .expect(201);

      const userId = registerRes.body.data.id;
      createdUserIds.push(userId);
      expect(registerRes.body.data.emailVerifiedAt).toBeNull();

      // 2. Extract verification token from dispatched email and verify account
      expect(dispatchedEmails.length).toBe(1);
      const verificationUrl = dispatchedEmails[0].verificationUrl;
      const rawToken = new URL(verificationUrl).searchParams.get('token');
      expect(rawToken).toBeTruthy();

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(200);

      // 3. Log in with valid credentials
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.message).toBe('Login successful');
      expect(loginRes.body.data.tokenType).toBe('Bearer');
      expect(typeof loginRes.body.data.expiresIn).toBe('number');
      expect(loginRes.body.data.expiresIn).toBeGreaterThan(0);
      expect(loginRes.body.data.user.id).toBe(userId);
      expect(loginRes.body.data.user.email).toBe(email.toLowerCase());
      expect(loginRes.body.data.user.emailVerifiedAt).not.toBeNull();

      // Ensure no sensitive hash or token fields leaked
      expect(loginRes.body.data.user.passwordHash).toBeUndefined();
      expect(loginRes.body.data.refreshToken).toBeUndefined();

      const accessToken = loginRes.body.data.accessToken;
      expect(typeof accessToken).toBe('string');

      // 4. Access protected endpoint GET /api/v1/auth/me with Bearer token
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.id).toBe(userId);
      expect(meRes.body.data.email).toBe(email.toLowerCase());
      expect(meRes.body.data.emailVerifiedAt).not.toBeNull();
      expect(meRes.body.data.passwordHash).toBeUndefined();

      // 5. Confirm that NO Session database record was created
      const sessions = await prisma.session.findMany({
        where: { userId },
      });
      expect(sessions.length).toBe(0);
    });
  });

  describe('Unverified User Login Rejection', () => {
    it('should reject login with 401 when user email has not been verified', async () => {
      const email = `unverified-${Date.now()}@andemta.et`;
      const password = 'StrongPassword123!';

      // Register without verifying
      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password })
        .expect(201);

      createdUserIds.push(regRes.body.data.id);

      // Attempt login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);

      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.message).toContain('Email verification is required');
    });
  });

  describe('Invalid Credentials Rejection', () => {
    it('should reject login with 401 when password is incorrect', async () => {
      const email = `wrong-pass-${Date.now()}@andemta.et`;
      const password = 'CorrectPassword123!';

      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password })
        .expect(201);

      createdUserIds.push(regRes.body.data.id);

      // Verify email directly in database
      await prisma.user.update({
        where: { id: regRes.body.data.id },
        data: { emailVerifiedAt: new Date() },
      });

      // Attempt login with wrong password
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123!' })
        .expect(401);

      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.message).toBe('Invalid email or password');
    });

    it('should reject login with 401 when email does not exist', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent-user@andemta.et',
          password: 'SomePassword123!',
        })
        .expect(401);

      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.message).toBe('Invalid email or password');
    });
  });

  describe('Email Normalization During Login', () => {
    it('should match user even if login email has whitespace and uppercase letters', async () => {
      const baseEmail = `normalize-${Date.now()}@andemta.et`;
      const password = 'NormalizePassword123!';

      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: baseEmail, password })
        .expect(201);

      createdUserIds.push(regRes.body.data.id);

      await prisma.user.update({
        where: { id: regRes.body.data.id },
        data: { emailVerifiedAt: new Date() },
      });

      const messyEmail = `   ${baseEmail.toUpperCase()}   `;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: messyEmail, password })
        .expect(200);

      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.user.email).toBe(baseEmail.toLowerCase());
    });
  });

  describe('Protected Endpoint Guard Behavior', () => {
    it('should reject requests without Authorization header with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Missing Bearer authentication token');
    });

    it('should reject requests with malformed or tampered token with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid access token');
    });

    it('should reject requests with expired access token with 401', async () => {
      // Sign an expired token using same secret
      const expiredToken = await jwtService.signAsync(
        { sub: 'some-user-id', jti: 'test-jti' },
        { expiresIn: '-1s' },
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Access token has expired');
    });
  });
});
