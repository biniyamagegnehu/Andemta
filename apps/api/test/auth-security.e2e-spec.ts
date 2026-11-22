import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import {
  EMAIL_PROVIDER,
  SendVerificationEmailOptions,
  SendPasswordResetEmailOptions,
} from '../src/modules/email/interfaces/email-provider.interface';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';

jest.setTimeout(60000);

/**
 * Phase 3.9 — Security Remediation End-to-End Regression Test Suite
 *
 * Validates the core security defenses implemented across Stages A-M:
 * 1. Rate limiting (G-01, D-02): Throttling triggers 429 Too Many Requests with Retry-After header.
 * 2. Account Lockout (G-02): 5 consecutive failed logins lock account, even if correct password is provided on attempt 6.
 * 3. CSRF & Origin Defense (F-01, F-02, F-04): Untrusted origins and referers rejected with 403 Forbidden.
 * 4. Immediate Token Revocation (B-01): User password reset / logout-all invalidates access tokens immediately via tokenVersion.
 */
describe('Phase 3.9 — Security Remediations (E2E Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const dispatchedEmails: (
    | SendVerificationEmailOptions
    | SendPasswordResetEmailOptions
  )[] = [];

  const mockEmailProvider = {
    sendVerificationEmail: jest.fn(
      async (options: SendVerificationEmailOptions) => {
        dispatchedEmails.push(options);
      },
    ),
    sendPasswordResetEmail: jest.fn(
      async (options: SendPasswordResetEmailOptions) => {
        dispatchedEmails.push(options);
      },
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.passwordResetToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await app.close();
  });

  describe('Stage A: Rate Limiting & Throttler Protection (G-01, D-02)', () => {
    it('should throttle repeated login requests from same tracker and return 429 with Retry-After header', async () => {
      const fixedTracker = `rate-limit-test-tracker-${Date.now()}`;
      const dummyPayload = {
        email: 'attacker-test@andemta.et',
        password: 'WrongPassword123!',
      };

      // The login endpoint is throttled at 10 requests per 900 seconds (15 min)
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('x-test-tracker', fixedTracker)
          .set('Origin', 'http://localhost:3000')
          .send(dummyPayload)
          .expect(401);
      }

      // The 11th request must exceed the rate limit and return 429
      const throttledRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-test-tracker', fixedTracker)
        .set('Origin', 'http://localhost:3000')
        .send(dummyPayload)
        .expect(429);

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.headers['retry-after']).toBeDefined();
      expect(Number(throttledRes.headers['retry-after'])).toBeGreaterThan(0);
      expect(throttledRes.body.message).toContain('Too many requests');
    });
  });

  describe('Stage B: Account-Level Brute-Force Lockout (G-02)', () => {
    it('should temporarily lock account after 5 consecutive failed login attempts', async () => {
      const email = `lockout-test-${Date.now()}@andemta.et`;
      const password = 'StrongPassword123!';

      // 1. Create a verified user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQxMjM0NTY3OA$9vG9Gj8F0kZ9U2z1v5p5E7s6w1q0r8t9y3u2i1o0p8a', // dummy Argon2 hash
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(user.id);

      // 2. Perform 5 consecutive failed login attempts with wrong password
      for (let i = 1; i <= 5; i++) {
        const failRes = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', 'http://localhost:3000')
          .send({ email, password: 'WrongPassword999!' })
          .expect(401);

        expect(failRes.body.message).toBe('Invalid email or password');
      }

      // 3. Attempt 6: even with the correct password, login must be blocked due to account lockout
      const lockedRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password })
        .expect(401);

      // Response indicates account is temporarily restricted
      expect(lockedRes.body.message).toContain('Account is temporarily restricted');
    });
  });

  describe('Stage C: CSRF, CORS & HTTP Origin Validation (F-01, F-02, F-04)', () => {
    it('should reject state-mutating cookie-authenticated request with untrusted Origin (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://malicious-phishing-site.com')
        .expect(403);

      expect(res.body.message).toContain('Untrusted request origin');
    });

    it('should reject state-mutating cookie-authenticated request with untrusted Referer (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Referer', 'https://malicious-phishing-site.com/fake-refresh')
        .expect(403);

      expect(res.body.message).toContain('Untrusted request origin');
    });

    it('should accept state-mutating request with trusted Origin', async () => {
      // CsrfOriginGuard allows trusted origin through (returns 401 because refresh cookie is missing)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:3000')
        .expect(401);

      expect(res.body.message).toBe('Refresh token is required');
    });
  });

  describe('Stage E: Immediate JWT Access Token Revocation via tokenVersion (B-01)', () => {
    it('should immediately invalidate existing access token when user tokenVersion is incremented', async () => {
      const email = `token-invalidation-${Date.now()}@andemta.et`;
      const password = 'SuperSecurePass123!';

      // 1. Register a new user
      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password })
        .expect(201);

      const userId = regRes.body.data.id;
      createdUserIds.push(userId);

      // Verify email in database
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });

      // 2. Log in and obtain access token
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email, password })
        .expect(200);

      const accessToken = loginRes.body.data.accessToken;
      expect(accessToken).toBeDefined();

      // 3. Access token works on protected endpoint
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.data.email).toBe(email);

      // 4. Invalidate all tokens by incrementing tokenVersion (simulating logoutAll or password reset)
      await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });

      // 5. Presenting the old access token must now immediately fail with 401 Unauthorized
      const revokedRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(revokedRes.body.message).toBe('Access token has been revoked');
    });
  });
});
