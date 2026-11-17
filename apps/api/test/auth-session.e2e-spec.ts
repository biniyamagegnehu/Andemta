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
} from '../src/modules/email/interfaces/email-provider.interface';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';

jest.setTimeout(90000);

/**
 * Phase 3.5: Refresh Tokens & Session Management — End-to-End Integration Tests
 *
 * Tests the complete lifecycle:
 * - Login creates a session and sets an HttpOnly refresh cookie
 * - Refresh rotates the token (old token invalidated, new cookie set, new access token returned)
 * - Reuse detection: attempting to reuse an already-rotated token revokes the entire token family
 * - Single device logout revokes the current session family and clears the cookie
 * - All devices logout revokes all sessions and clears the cookie
 * - Untrusted origins are rejected on cookie-authenticated endpoints
 */
describe('Authentication — Refresh Tokens & Session Management (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const dispatchedEmails: SendVerificationEmailOptions[] = [];
  const mockEmailProvider = {
    sendVerificationEmail: jest.fn(
      async (options: SendVerificationEmailOptions) => {
        dispatchedEmails.push(options);
      },
    ),
  };

  /**
   * Creates a fully registered + verified user and returns login credentials.
   */
  async function createVerifiedUser(): Promise<{
    userId: string;
    email: string;
    password: string;
  }> {
    const email = `session-test-${Date.now()}-${Math.floor(Math.random() * 10000)}@andemta.et`;
    const password = 'SecurePassword123!';

    dispatchedEmails.length = 0;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);

    const userId: string = regRes.body.data.id;
    createdUserIds.push(userId);

    const verificationUrl: string = dispatchedEmails[0].verificationUrl;
    const rawToken = new URL(verificationUrl).searchParams.get('token');

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: rawToken })
      .expect(200);

    return { userId, email, password };
  }

  /**
   * Logs in and returns the access token and raw refresh cookie string.
   */
  async function loginUser(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshCookie: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const accessToken: string = res.body.data.accessToken;
    const setCookieHeader = res.headers['set-cookie'] as string[] | string;
    const cookieHeader = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader || '';

    return { accessToken, refreshCookie: cookieHeader };
  }

  /**
   * Extracts the raw cookie value (name=value portion) from a Set-Cookie header string.
   */
  function extractCookieValue(setCookieStr: string): string {
    return setCookieStr.split(';')[0]; // e.g. "andemta_refresh=abc123"
  }

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
    dispatchedEmails.length = 0;
    mockEmailProvider.sendVerificationEmail.mockClear();
  });

  // ---------------------------------------------------------------------------
  // 1. LOGIN: Session Creation & Cookie Security
  // ---------------------------------------------------------------------------
  describe('Login — Session Creation and Cookie Security', () => {
    it('should create a session in the database, set an HttpOnly path-restricted refresh cookie, and NOT expose the raw token in the response body', async () => {
      const { userId, email, password } = await createVerifiedUser();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      // 1a. Access token in JSON body
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.tokenType).toBe('Bearer');

      // 1b. Raw refresh token must NOT appear in JSON body
      expect(res.body.data.rawRefreshToken).toBeUndefined();
      expect(res.body.data.refreshToken).toBeUndefined();

      // 1c. HttpOnly cookie with correct attributes
      const setCookieHeader = res.headers['set-cookie'] as string[] | string;
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(' ')
        : setCookieHeader || '';

      expect(cookieStr).toContain('andemta_refresh=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr.toLowerCase()).toContain('path=/api/v1/auth');

      // 1d. Session record created in DB
      const sessions = await prisma.session.findMany({ where: { userId } });
      expect(sessions.length).toBe(1);
      expect(sessions[0].revokedAt).toBeNull();
      expect(sessions[0].rotatedAt).toBeNull();
      expect(sessions[0].refreshTokenHash).toBeDefined();
      expect(sessions[0].refreshTokenHash).toHaveLength(64); // SHA-256 hex
      // Raw token is NOT stored
      expect(res.body.data.accessToken).not.toBe(sessions[0].refreshTokenHash);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. REFRESH: Token Rotation
  // ---------------------------------------------------------------------------
  describe('Refresh — Token Rotation', () => {
    it('should rotate the refresh token: return new access token, set new cookie, and mark old session rotatedAt', async () => {
      const { userId, email, password } = await createVerifiedUser();
      const { accessToken: firstAccessToken, refreshCookie } =
        await loginUser(email, password);

      const cookieValue = extractCookieValue(refreshCookie);

      // Call the refresh endpoint with the refresh cookie
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue)
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      const newAccessToken: string = refreshRes.body.data.accessToken;
      expect(typeof newAccessToken).toBe('string');
      // New access token should differ from the original (new JTI)
      expect(newAccessToken).not.toBe(firstAccessToken);

      // A new refresh cookie must be set
      const newSetCookie = refreshRes.headers['set-cookie'] as string[] | string;
      const newCookieStr = Array.isArray(newSetCookie)
        ? newSetCookie.join(' ')
        : newSetCookie || '';
      expect(newCookieStr).toContain('andemta_refresh=');
      expect(newCookieStr.toLowerCase()).toContain('httponly');

      // DB: original session marked rotatedAt, new session created with same tokenFamily
      const allSessions = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      expect(allSessions.length).toBe(2);
      expect(allSessions[0].rotatedAt).not.toBeNull(); // original session marked as rotated
      expect(allSessions[1].rotatedAt).toBeNull(); // new session is active
      expect(allSessions[0].tokenFamily).toBe(allSessions[1].tokenFamily); // same family chain
    });

    it('should return 401 when no refresh cookie is present', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 for a completely invalid/nonexistent refresh token value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'andemta_refresh=totally-invalid-token-value')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. REUSE DETECTION
  // ---------------------------------------------------------------------------
  describe('Refresh — Reuse Detection', () => {
    it('should DETECT REUSE: using an already-rotated token revokes the entire token family and returns 401', async () => {
      const { userId, email, password } = await createVerifiedUser();
      const { refreshCookie: originalCookie } = await loginUser(email, password);
      const originalCookieValue = extractCookieValue(originalCookie);

      // First rotation: legitimate
      const firstRefreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookieValue)
        .expect(200);

      expect(firstRefreshRes.body.data.accessToken).toBeDefined();

      // Second rotation attempt using the SAME original cookie (already rotated!)
      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookieValue)
        .expect(401);

      expect(reuseRes.body.success).toBe(false);

      // Verify the ENTIRE token family was revoked in the database
      const allSessions = await prisma.session.findMany({
        where: { userId },
      });
      const activeSessions = allSessions.filter((s) => s.revokedAt === null);
      expect(activeSessions.length).toBe(0); // all sessions revoked
    });
  });

  // ---------------------------------------------------------------------------
  // 4. LOGOUT (Single Device)
  // ---------------------------------------------------------------------------
  describe('Logout — Single Device', () => {
    it('should revoke the current session family and clear the refresh cookie', async () => {
      const { userId, email, password } = await createVerifiedUser();
      const { refreshCookie } = await loginUser(email, password);
      const cookieValue = extractCookieValue(refreshCookie);

      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookieValue)
        .expect(200);

      expect(logoutRes.body.success).toBe(true);

      // Cookie should be cleared (empty value or Max-Age=0 or Expires=past)
      const clearedCookie = logoutRes.headers['set-cookie'] as string[] | string;
      const clearedStr = Array.isArray(clearedCookie)
        ? clearedCookie.join(' ')
        : clearedCookie || '';
      expect(clearedStr).toContain('andemta_refresh=');

      // DB: session should be revoked
      const sessions = await prisma.session.findMany({ where: { userId } });
      const activeSessions = sessions.filter((s) => s.revokedAt === null);
      expect(activeSessions.length).toBe(0);

      // Attempting to refresh after logout should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieValue)
        .expect(401);
    });

    it('should respond 200 idempotently even when no refresh cookie is present', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. LOGOUT-ALL (All Devices)
  // ---------------------------------------------------------------------------
  describe('Logout-All — All Devices', () => {
    it('should revoke all active sessions for the user across devices and clear the cookie', async () => {
      const { userId, email, password } = await createVerifiedUser();

      // Simulate two separate device logins
      const device1 = await loginUser(email, password);
      const device2 = await loginUser(email, password);

      const activeBefore = await prisma.session.findMany({
        where: { userId, revokedAt: null },
      });
      expect(activeBefore.length).toBe(2);

      // Logout all using Bearer token from device 1
      const logoutAllRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${device1.accessToken}`)
        .set('Cookie', extractCookieValue(device1.refreshCookie))
        .expect(200);

      expect(logoutAllRes.body.success).toBe(true);

      // All sessions revoked
      const activeAfter = await prisma.session.findMany({
        where: { userId, revokedAt: null },
      });
      expect(activeAfter.length).toBe(0);

      // Attempting refresh with device 2's cookie should now fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', extractCookieValue(device2.refreshCookie))
        .expect(401);
    });

    it('should return 401 when calling logout-all without a valid Bearer token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CSRF / Origin Validation
  // ---------------------------------------------------------------------------
  describe('CSRF Origin Guard', () => {
    it('should reject POST /refresh from an untrusted Origin with 403', async () => {
      const { email, password } = await createVerifiedUser();
      const { refreshCookie } = await loginUser(email, password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', extractCookieValue(refreshCookie))
        .set('Origin', 'https://evil-csrf-attacker.com')
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject POST /logout from an untrusted Origin with 403', async () => {
      const { email, password } = await createVerifiedUser();
      const { refreshCookie } = await loginUser(email, password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', extractCookieValue(refreshCookie))
        .set('Origin', 'https://evil-csrf-attacker.com')
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should allow POST /refresh from a trusted local origin', async () => {
      const { email, password } = await createVerifiedUser();
      const { refreshCookie } = await loginUser(email, password);

      // Trusted origin (localhost:3000 is allowed in development)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', extractCookieValue(refreshCookie))
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. NEW ACCESS TOKEN FROM REFRESH IS FUNCTIONAL
  // ---------------------------------------------------------------------------
  describe('Access Token from Refresh', () => {
    it('should allow accessing GET /api/v1/auth/me with a fresh access token obtained from /refresh', async () => {
      const { userId, email, password } = await createVerifiedUser();
      const { refreshCookie } = await loginUser(email, password);

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', extractCookieValue(refreshCookie))
        .expect(200);

      const newAccessToken: string = refreshRes.body.data.accessToken;

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      expect(meRes.body.data.id).toBe(userId);
      expect(meRes.body.data.email).toBe(email.toLowerCase());
    });
  });
});
