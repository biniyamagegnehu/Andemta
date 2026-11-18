import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  EMAIL_PROVIDER,
  SendVerificationEmailOptions,
  SendPasswordResetEmailOptions,
} from '../src/modules/email/interfaces/email-provider.interface';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';
import { hashToken } from '../src/modules/auth/utils/token.utils';

jest.setTimeout(60000);

describe('Authentication — Password Recovery Flow (E2E Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const dispatchedVerificationEmails: SendVerificationEmailOptions[] = [];
  const dispatchedResetEmails: SendPasswordResetEmailOptions[] = [];

  const mockEmailProvider = {
    sendVerificationEmail: jest.fn(
      async (options: SendVerificationEmailOptions) => {
        dispatchedVerificationEmails.push(options);
      },
    ),
    sendPasswordResetEmail: jest.fn(
      async (options: SendPasswordResetEmailOptions) => {
        dispatchedResetEmails.push(options);
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

    app.use(cookieParser());
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(createGlobalValidationPipe());
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TransformInterceptor(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    prisma = app.get(PrismaService);
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
    dispatchedVerificationEmails.length = 0;
    dispatchedResetEmails.length = 0;
    mockEmailProvider.sendVerificationEmail.mockClear();
    mockEmailProvider.sendPasswordResetEmail.mockClear();
  });

  // Helper to register and verify a user directly
  async function createVerifiedUser(
    email: string,
    password = 'InitialPassword123!',
  ): Promise<string> {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);

    const userId = regRes.body.data.id;
    createdUserIds.push(userId);

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    return userId;
  }

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 with generic response and dispatch reset email for an existing user', async () => {
      const email = `forgot-user-${Date.now()}@andemta.et`;
      await createVerifiedUser(email);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe(
        'If an account exists for this email address, password reset instructions will be sent.',
      );
      expect(res.body.data).toEqual({});

      // Reset email should be dispatched
      expect(dispatchedResetEmails.length).toBe(1);
      expect(dispatchedResetEmails[0].recipientEmail).toBe(email);
      expect(dispatchedResetEmails[0].resetUrl).toContain('token=');
      expect(dispatchedResetEmails[0].expiresInMinutes).toBe(30);

      // Verify DB contains only the token hash, not raw token
      const rawToken = new URL(
        dispatchedResetEmails[0].resetUrl,
      ).searchParams.get('token');
      expect(rawToken).toBeTruthy();

      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: { tokenHash: hashToken(rawToken!) },
      });
      expect(tokenRecord).toBeTruthy();
      expect(tokenRecord?.usedAt).toBeNull();
    });

    it('should return identical 200 generic response and dispatch NO email for a non-existent email (anti-enumeration)', async () => {
      const nonexistentEmail = `unknown-${Date.now()}@andemta.et`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: nonexistentEmail })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe(
        'If an account exists for this email address, password reset instructions will be sent.',
      );
      expect(res.body.data).toEqual({});

      // No email should be dispatched
      expect(dispatchedResetEmails.length).toBe(0);
    });

    it('should normalize email with whitespace and uppercase before processing', async () => {
      const baseEmail = `normalize-forgot-${Date.now()}@andemta.et`;
      await createVerifiedUser(baseEmail);

      const messyEmail = `   ${baseEmail.toUpperCase()}   `;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: messyEmail })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(dispatchedResetEmails.length).toBe(1);
      expect(dispatchedResetEmails[0].recipientEmail).toBe(baseEmail);
    });

    it('should reject invalid email format with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-a-valid-email' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(dispatchedResetEmails.length).toBe(0);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reset password with valid token, reject old password, and allow login with new password', async () => {
      const email = `reset-user-${Date.now()}@andemta.et`;
      const oldPassword = 'OldInitialPassword123!';
      const newPassword = 'BrandNewPassword2026!';
      await createVerifiedUser(email, oldPassword);

      // 1. Request password reset
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(dispatchedResetEmails.length).toBe(1);
      const rawToken = new URL(
        dispatchedResetEmails[0].resetUrl,
      ).searchParams.get('token')!;

      // 2. Submit password reset request
      const resetRes = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword,
        })
        .expect(200);

      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.message).toBe('Password has been reset successfully');
      expect(resetRes.body.data).toEqual({});

      // 3. Attempt login with old password -> must fail with 401
      const oldLoginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(401);

      expect(oldLoginRes.body.success).toBe(false);
      expect(oldLoginRes.body.message).toBe('Invalid email or password');

      // 4. Attempt login with new password -> must succeed with 200
      const newLoginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);

      expect(newLoginRes.body.success).toBe(true);
      expect(newLoginRes.body.data.accessToken).toBeDefined();

      // 5. Attempting to reuse the same reset token -> must fail with 400
      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'AnotherPassword123!',
        })
        .expect(400);

      expect(reuseRes.body.success).toBe(false);
      expect(reuseRes.body.message).toBe(
        'Invalid or expired password reset token',
      );
    });

    it('should reject non-existent or invalid reset token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'completely-bogus-token-value',
          newPassword: 'ValidPassword123!',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired password reset token');
    });

    it('should reject expired reset token with 400', async () => {
      const email = `expired-token-user-${Date.now()}@andemta.et`;
      const userId = await createVerifiedUser(email);

      // Create manually expired token in database
      const expiredRawToken = 'raw-expired-token-value-12345';
      await prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken(expiredRawToken),
          expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
          usedAt: null,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: expiredRawToken,
          newPassword: 'ValidPassword123!',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired password reset token');
    });

    it('should reject new password shorter than 12 characters with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'any-token-value',
          newPassword: 'short',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Session Revocation across all devices after Password Reset', () => {
    it('should revoke all existing refresh-token sessions when password is reset', async () => {
      const email = `session-revocation-${Date.now()}@andemta.et`;
      const password = 'InitialPassword123!';
      const newPassword = 'NewSecretPassword123!';
      await createVerifiedUser(email, password);

      // 1. Log in to establish an active session (Session 1)
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      const setCookieHeader = loginRes.headers['set-cookie'] as
        | string[]
        | string;
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader;
      expect(cookieStr).toContain('andemta_refresh=');

      // 2. Request and complete password reset
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      const rawToken = new URL(
        dispatchedResetEmails[0].resetUrl,
      ).searchParams.get('token')!;

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword })
        .expect(200);

      // 3. Attempt to use old session refresh cookie -> must be rejected with 401
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [cookieStr])
        .set('Origin', 'http://localhost:3000')
        .expect(401);

      expect(refreshRes.body.success).toBe(false);
      expect(refreshRes.body.message).toContain('Session has been revoked');
    });

    it('should NOT affect sessions belonging to other users', async () => {
      const userAEmail = `user-a-${Date.now()}@andemta.et`;
      const userBEmail = `user-b-${Date.now()}@andemta.et`;
      const password = 'Password123456!';
      const newPasswordA = 'NewPasswordA123456!';

      await createVerifiedUser(userAEmail, password);
      await createVerifiedUser(userBEmail, password);

      // User B logs in
      const loginBRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userBEmail, password })
        .expect(200);

      const setCookieB = loginBRes.headers['set-cookie'] as
        | string[]
        | string;
      const cookieB = Array.isArray(setCookieB) ? setCookieB[0] : setCookieB;

      // User A resets their password
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: userAEmail })
        .expect(200);

      const rawTokenA = new URL(
        dispatchedResetEmails[0].resetUrl,
      ).searchParams.get('token')!;

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawTokenA, newPassword: newPasswordA })
        .expect(200);

      // User B's session should STILL be valid and capable of refreshing
      const refreshBRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [cookieB])
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(refreshBRes.body.success).toBe(true);
      expect(refreshBRes.body.data.user.email).toBe(userBEmail);
    });
  });

  describe('Concurrency & Race Condition Defenses', () => {
    it('should prevent concurrent double-consumption of the same reset token', async () => {
      const email = `concurrency-${Date.now()}@andemta.et`;
      await createVerifiedUser(email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      const rawToken = new URL(
        dispatchedResetEmails[0].resetUrl,
      ).searchParams.get('token')!;

      // Fire two simultaneous reset requests with the same token
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken, newPassword: 'ConcurrentPassword1!' }),
        request(app.getHttpServer())
          .post('/api/v1/auth/reset-password')
          .send({ token: rawToken, newPassword: 'ConcurrentPassword2!' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one request must succeed (200), and the other must be rejected (400)
      expect(statuses).toEqual([200, 400]);
    });
  });
});
