import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request = require('supertest');
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

jest.setTimeout(90000);

/**
 * Phase 3.14: Complete Authentication Integration & End-to-End Lifecycle Suite
 *
 * Verifies that the entire authentication architecture functions cohesively as a single,
 * hardened system across the full end-to-end user lifecycle:
 *
 * 1.  Registration (`POST /api/v1/auth/register`)
 * 2.  Verification token generation and email dispatch
 * 3.  Email verification (`POST /api/v1/auth/verify-email`)
 * 4.  Single-use token defense (replay rejection)
 * 5.  Resend verification non-enumeration defense
 * 6.  Credential-based login (`POST /api/v1/auth/login`)
 * 7.  Protected current-user retrieval (`GET /api/v1/auth/me`)
 * 8.  Session rotation via refresh token (`POST /api/v1/auth/refresh`)
 * 9.  CSRF Origin / Referer validation on refresh endpoint
 * 10. Refresh token reuse detection & immediate family revocation
 * 11. Re-authentication after family revocation
 * 12. Password recovery request (`POST /api/v1/auth/forgot-password`)
 * 13. Password reset (`POST /api/v1/auth/reset-password`)
 * 14. Immediate access-token invalidation via `tokenVersion` check
 * 15. Password rotation verification (old password rejected, new accepted)
 * 16. Single-device session logout (`POST /api/v1/auth/logout`)
 * 17. Multi-device global logout (`POST /api/v1/auth/logout-all`)
 */
describe('Phase 3.14 — Complete Authentication Lifecycle (E2E Integration)', () => {
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

  it('should execute the complete authentication lifecycle from registration to global logout', async () => {
    const testEmail = `lifecycle-${Date.now()}@andemta.et`;
    const initialPassword = 'StrongP@ssw0rd2026!';
    const updatedPassword = 'NewStrongP@ssw0rd2026!';

    // =========================================================================
    // 1. REGISTRATION
    // =========================================================================
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: initialPassword })
      .expect(201);

    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data).toBeDefined();
    expect(regRes.body.data.id).toBeDefined();
    expect(regRes.body.data.email).toBe(testEmail);
    expect(regRes.body.data.emailVerifiedAt).toBeNull();
    const userId = regRes.body.data.id;
    createdUserIds.push(userId);

    // Verify verification email dispatched with raw token
    expect(dispatchedVerificationEmails.length).toBe(1);
    expect(dispatchedVerificationEmails[0].recipientEmail).toBe(testEmail);
    const verificationUrl = new URL(dispatchedVerificationEmails[0].verificationUrl);
    const verificationToken = verificationUrl.searchParams.get('token')!;
    expect(verificationToken).toBeDefined();

    // =========================================================================
    // 2. EMAIL VERIFICATION
    // =========================================================================
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.email).toBe(testEmail);
    expect(verifyRes.body.data.emailVerifiedAt).not.toBeNull();

    // Verify database reflection
    const dbUserAfterVerify = await prisma.user.findUnique({
      where: { id: userId },
    });
    expect(dbUserAfterVerify?.emailVerifiedAt).not.toBeNull();

    // Single-use token verification: replay must fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken })
      .expect(400);

    // Resend verification for already-verified account must return 200 without creating token
    dispatchedVerificationEmails.length = 0;
    const resendRes = await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .send({ email: testEmail })
      .expect(200);
    expect(resendRes.body.success).toBe(true);
    expect(dispatchedVerificationEmails.length).toBe(0); // No new email sent

    // =========================================================================
    // 3. CREDENTIAL LOGIN
    // =========================================================================
    // Incorrect password rejected
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPassword123!' })
      .expect(401);

    // Correct login succeeds
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: initialPassword })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.accessToken).toBeDefined();
    expect(loginRes.body.data.tokenType).toBe('Bearer');
    expect(loginRes.body.data.user.email).toBe(testEmail);

    let accessToken = loginRes.body.data.accessToken;

    // Verify HttpOnly refresh cookie is set
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    let refreshCookie = cookies.find((c: string) => c.startsWith('andemta_refresh='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');

    // =========================================================================
    // 4. PROTECTED CURRENT-USER ACCESS (/auth/me)
    // =========================================================================
    // Without token -> 401
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    // With valid Bearer token -> 200
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.id).toBe(userId);
    expect(meRes.body.data.email).toBe(testEmail);

    // =========================================================================
    // 5. SESSION ROTATION & REFRESH (/auth/refresh)
    // =========================================================================
    // CSRF defense: missing or invalid origin rejected on cookie endpoint
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('Origin', 'http://malicious-attacker.com')
      .expect(403);

    // Valid refresh with trusted origin
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const rotatedAccessToken = refreshRes.body.data.accessToken;
    expect(rotatedAccessToken).not.toBe(accessToken);

    const rotatedCookies = refreshRes.headers['set-cookie'] as unknown as string[];
    const rotatedRefreshCookie = rotatedCookies.find((c: string) =>
      c.startsWith('andemta_refresh='),
    );
    expect(rotatedRefreshCookie).toBeDefined();

    // =========================================================================
    // 6. REFRESH TOKEN REUSE DETECTION & FAMILY REVOCATION
    // =========================================================================
    // Attempting to reuse the consumed old refresh cookie must trigger reuse detection
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(401);

    // The entire session family must now be revoked; even rotated cookie should fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rotatedRefreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(401);

    // =========================================================================
    // 7. RE-LOGIN AFTER FAMILY REVOCATION
    // =========================================================================
    const reLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: initialPassword })
      .expect(200);

    accessToken = reLoginRes.body.data.accessToken;
    const reLoginCookies = reLoginRes.headers['set-cookie'] as unknown as string[];
    refreshCookie = reLoginCookies.find((c: string) => c.startsWith('andemta_refresh='));

    // =========================================================================
    // 8. PASSWORD RECOVERY (FORGOT & RESET)
    // =========================================================================
    const forgotRes = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: testEmail })
      .expect(200);

    expect(forgotRes.body.success).toBe(true);
    expect(dispatchedResetEmails.length).toBe(1);
    expect(dispatchedResetEmails[0].recipientEmail).toBe(testEmail);
    const resetUrl = new URL(dispatchedResetEmails[0].resetUrl);
    const resetToken = resetUrl.searchParams.get('token')!;
    expect(resetToken).toBeDefined();

    // Reset password with new password
    const resetRes = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: updatedPassword })
      .expect(200);

    expect(resetRes.body.success).toBe(true);

    // Verify tokenVersion incremented and sessions revoked in database
    const dbUserAfterReset = await prisma.user.findUnique({
      where: { id: userId },
    });
    expect(dbUserAfterReset?.tokenVersion).toBeGreaterThan(0);

    const activeSessions = await prisma.session.findMany({
      where: { userId, revokedAt: null },
    });
    expect(activeSessions.length).toBe(0);

    // =========================================================================
    // 9. OLD ACCESS TOKEN IMMEDIATELY INVALIDATED
    // =========================================================================
    // The previous access token carried the old tokenVersion (0); now invalid
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // Old refresh cookie is also revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(401);

    // =========================================================================
    // 10. LOGIN WITH ROTATED PASSWORD
    // =========================================================================
    // Old password rejected
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: initialPassword })
      .expect(401);

    // New password succeeds
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: updatedPassword })
      .expect(200);

    const postResetAccessToken = newLoginRes.body.data.accessToken;
    const postResetCookies = newLoginRes.headers['set-cookie'] as unknown as string[];
    const postResetRefreshCookie = postResetCookies.find((c: string) =>
      c.startsWith('andemta_refresh='),
    );

    // Verify protected access with new token
    const newMeRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${postResetAccessToken}`)
      .expect(200);
    expect(newMeRes.body.data.email).toBe(testEmail);

    // =========================================================================
    // 11. SINGLE-DEVICE LOGOUT
    // =========================================================================
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', [postResetRefreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(logoutRes.body.success).toBe(true);
    // Verify cookie cleared with Max-Age=0 or Expires in past
    const logoutCookies = logoutRes.headers['set-cookie'] as unknown as string[];
    expect(logoutCookies.some((c: string) => c.includes('Max-Age=0') || c.includes('Expires='))).toBe(true);

    // Refresh after logout fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [postResetRefreshCookie!])
      .set('Origin', 'http://localhost:3000')
      .expect(401);

    // =========================================================================
    // 12. MULTI-DEVICE GLOBAL LOGOUT (/auth/logout-all)
    // =========================================================================
    // Establish a new session
    const multiLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: updatedPassword })
      .expect(200);

    const multiAccessToken = multiLoginRes.body.data.accessToken;

    // Call logout-all with Bearer token
    const logoutAllRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${multiAccessToken}`)
      .expect(200);

    expect(logoutAllRes.body.success).toBe(true);

    // Access token is immediately invalidated (tokenVersion incremented)
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${multiAccessToken}`)
      .expect(401);
  });
});
