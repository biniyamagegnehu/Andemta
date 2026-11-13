import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import * as crypto from 'crypto';
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
import { GENERIC_RESEND_MESSAGE } from '../src/modules/auth/services/email-verification.service';

jest.setTimeout(60000);

describe('Authentication — Email Verification (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  // Track dispatched emails to inspect token URLs during integration testing
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
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      // Cascade delete handles email_verification_tokens
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

  describe('Registration & Automatic Verification Issuance', () => {
    it('should register user, keep emailVerifiedAt null, create verification token, and dispatch email', async () => {
      const email = `test-verify-${Date.now()}@andemta.et`;
      const password = 'SecureEthiopia123!';

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password })
        .expect(201);

      const userId = response.body.data.id;
      createdUserIds.push(userId);

      // 1. User emailVerifiedAt is null
      expect(response.body.data.emailVerifiedAt).toBeNull();

      // 2. Email verification was dispatched
      expect(mockEmailProvider.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(dispatchedEmails[0].recipientEmail).toBe(email);
      expect(dispatchedEmails[0].verificationUrl).toContain(
        '/verify-email?token=',
      );

      // 3. Database token record exists
      const tokenRecord = await prisma.emailVerificationToken.findFirst({
        where: { userId },
      });
      expect(tokenRecord).toBeDefined();
      expect(tokenRecord?.usedAt).toBeNull();
      expect(tokenRecord?.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // 4. No session created
      const sessionCount = await prisma.session.count({ where: { userId } });
      expect(sessionCount).toBe(0);
    });

    it('should not leave active undelivered token when email delivery fails during registration', async () => {
      mockEmailProvider.sendVerificationEmail.mockRejectedValueOnce(
        new Error('Simulated Brevo outage'),
      );

      const email = `test-verify-fail-${Date.now()}@andemta.et`;
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SecureEthiopia123!' })
        .expect(201);

      const userId = response.body.data.id;
      createdUserIds.push(userId);

      // User was created and not deleted
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user).toBeDefined();

      // The token created during failed attempt was invalidated (usedAt is not null)
      const tokens = await prisma.emailVerificationToken.findMany({
        where: { userId },
      });
      expect(tokens.length).toBe(1);
      expect(tokens[0].usedAt).not.toBeNull();
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    let testUserId: string;
    let testRawToken: string;

    beforeEach(async () => {
      const email = `verify-flow-${Date.now()}@andemta.et`;
      const regResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SecureEthiopia123!' })
        .expect(201);

      testUserId = regResponse.body.data.id;
      createdUserIds.push(testUserId);

      // Extract raw token from dispatched email
      const lastEmail = dispatchedEmails[dispatchedEmails.length - 1];
      const url = new URL(lastEmail.verificationUrl);
      testRawToken = url.searchParams.get('token')!;
    });

    it('should successfully verify email with valid token and return 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: testRawToken })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Email verified successfully',
        data: expect.objectContaining({
          email: expect.stringContaining('verify-flow-'),
          emailVerifiedAt: expect.any(String),
        }),
        meta: null,
      });

      // Verify user in PostgreSQL has emailVerifiedAt populated
      const dbUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(dbUser?.emailVerifiedAt).not.toBeNull();

      // Verify token in PostgreSQL is marked used
      const tokenHash = crypto
        .createHash('sha256')
        .update(testRawToken)
        .digest('hex');
      const dbToken = await prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      expect(dbToken?.usedAt).not.toBeNull();
    });

    it('should reject already-consumed token on second attempt (400 Bad Request)', async () => {
      // First verification succeeds
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: testRawToken })
        .expect(200);

      // Second verification fails
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: testRawToken })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('verification token');
    });

    it('should reject nonexistent token with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'completely-bogus-token-string-12345' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('verification token');
    });

    it('should reject expired verification token with 400 Bad Request', async () => {
      // Backdate the token in DB to simulate expiration
      const tokenHash = crypto
        .createHash('sha256')
        .update(testRawToken)
        .digest('hex');
      await prisma.emailVerificationToken.update({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 60000) }, // 1 minute in the past
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: testRawToken })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('verification token');
    });

    it('should prevent concurrent double-consumption of the same token', async () => {
      // Send two concurrent verification requests with the same token
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/verify-email')
          .send({ token: testRawToken }),
        request(app.getHttpServer())
          .post('/api/v1/auth/verify-email')
          .send({ token: testRawToken }),
      ]);

      const statuses = [res1.status, res2.status].sort();

      // Exactly one must succeed (200) and the other must fail (400)
      expect(statuses).toEqual([200, 400]);
    });
  });

  describe('POST /api/v1/auth/resend-verification', () => {
    it('should invalidate old token, issue new token, and return generic 200 message for unverified user', async () => {
      const email = `resend-test-${Date.now()}@andemta.et`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SecureEthiopia123!' })
        .expect(201);

      const userId = reg.body.data.id;
      createdUserIds.push(userId);

      const firstToken = await prisma.emailVerificationToken.findFirst({
        where: { userId },
      });

      // Request resend with mixed case and whitespace
      const resendResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: `  ${email.toUpperCase()}  ` })
        .expect(200);

      expect(resendResponse.body).toEqual({
        success: true,
        message: GENERIC_RESEND_MESSAGE,
        data: { message: GENERIC_RESEND_MESSAGE },
        meta: null,
      });

      // Old token is now invalidated
      const oldToken = await prisma.emailVerificationToken.findUnique({
        where: { id: firstToken!.id },
      });
      expect(oldToken?.usedAt).not.toBeNull();

      // New active token exists
      const activeTokens = await prisma.emailVerificationToken.findMany({
        where: { userId, usedAt: null },
      });
      expect(activeTokens.length).toBe(1);
      expect(activeTokens[0].id).not.toBe(firstToken!.id);
    });

    it('should return identical generic message for nonexistent email without sending email', async () => {
      const resendResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'ghost-account-999@andemta.et' })
        .expect(200);

      expect(resendResponse.body).toEqual({
        success: true,
        message: GENERIC_RESEND_MESSAGE,
        data: { message: GENERIC_RESEND_MESSAGE },
        meta: null,
      });

      expect(mockEmailProvider.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should return identical generic message for already-verified email without sending email', async () => {
      const email = `already-verified-${Date.now()}@andemta.et`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SecureEthiopia123!' })
        .expect(201);

      const userId = reg.body.data.id;
      createdUserIds.push(userId);

      // Verify the user directly in DB
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });

      mockEmailProvider.sendVerificationEmail.mockClear();

      const resendResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email })
        .expect(200);

      expect(resendResponse.body.message).toBe(GENERIC_RESEND_MESSAGE);
      expect(mockEmailProvider.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});

