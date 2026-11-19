import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import request = require('supertest');
import { OAuth2Client } from 'google-auth-library';
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

jest.setTimeout(60000);

describe('Authentication — Google OAuth 2.0 (E2E Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const redisStore = new Map<string, string>();
  const redisClientMock = {
    set: jest.fn(
      async (key: string, val: string, _mode?: string, _duration?: number) => {
        redisStore.set(key, val);
        return 'OK';
      },
    ),
    getdel: jest.fn(async (key: string) => {
      const val = redisStore.get(key) ?? null;
      redisStore.delete(key);
      return val;
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
  };

  const redisMock = {
    ping: jest.fn().mockResolvedValue('PONG'),
    checkHealth: jest.fn().mockResolvedValue(true),
    getClient: jest.fn().mockReturnValue(redisClientMock),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };

  const mockEmailProvider = {
    sendVerificationEmail: jest.fn(
      async (_options: SendVerificationEmailOptions) => undefined,
    ),
    sendPasswordResetEmail: jest.fn(
      async (_options: SendPasswordResetEmailOptions) => undefined,
    ),
  };

  beforeAll(async () => {
    // Set test configuration for Google OAuth
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret-12345';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:4000/api/v1/auth/google/callback';
    process.env.FRONTEND_GOOGLE_AUTH_SUCCESS_URL = 'http://localhost:3000/auth/google/callback';
    process.env.FRONTEND_GOOGLE_AUTH_FAILURE_URL = 'http://localhost:3000/login';
    process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS = '300';

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
    redisStore.clear();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/auth/google — Initiation', () => {
    it('should generate Google OAuth authorization URL with state, nonce, PKCE and redirect 302', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);

      const redirectUrl = res.headers.location;
      expect(redirectUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(redirectUrl).toContain('client_id=test-google-client-id.apps.googleusercontent.com');
      expect(redirectUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback');
      expect(redirectUrl).toContain('scope=openid%20email%20profile');
      expect(redirectUrl).toContain('code_challenge=');
      expect(redirectUrl).toContain('code_challenge_method=S256');

      // Verify transaction is stored in Redis with 300s TTL
      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [storedKey, rawTransaction, _ex, ttl] = redisClientMock.set.mock.calls[0];
      expect(storedKey).toMatch(/^oauth:google:state:/);
      expect(ttl).toBe(300);

      const parsed = JSON.parse(rawTransaction);
      expect(parsed.action).toBe('login');
      expect(parsed.state).toBeDefined();
      expect(parsed.nonce).toBeDefined();
      expect(parsed.codeVerifier).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/google/link — Linking Initiation', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/google/link')
        .expect(401);
    });

    it('should initiate linking and store authenticated user ID in Redis transaction when authenticated', async () => {
      // 1. Register and verify a user to get an access token
      const email = `link-init-${Date.now()}@andemta.et`;
      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'StrongPassword123!' })
        .expect(201);

      const userId = regRes.body.data.id;
      createdUserIds.push(userId);

      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'StrongPassword123!' })
        .expect(200);

      const accessToken = loginRes.body.data.accessToken;

      // 2. Initiate account linking with Bearer token
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(302);

      expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');

      // Verify Redis transaction has action: 'link' and the userId
      const [storedKey, rawTransaction] = redisClientMock.set.mock.calls[0];
      const parsed = JSON.parse(rawTransaction);
      expect(parsed.action).toBe('link');
      expect(parsed.userId).toBe(userId);
    });
  });

  describe('GET /api/v1/auth/google/callback — Error & Defense Handling', () => {
    it('should redirect to failure URL when Google returns error query parameter (e.g. access_denied)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback?error=access_denied')
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?error=access_denied');
    });

    it('should redirect to failure URL with invalid_request when code or state is missing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback?code=some-code')
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?error=invalid_request');
    });

    it('should redirect to failure URL with invalid_or_expired_state when state is unknown or expired in Redis', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback?code=some-code&state=nonexistent-state')
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?error=invalid_or_expired_state');
    });
  });

  describe('GET /api/v1/auth/google/callback — Case B: New User Registration & Login', () => {
    it('should create new User with null passwordHash, create ExternalAccount, set HttpOnly refresh cookie and redirect to success URL', async () => {
      const googleSub = `sub-new-${Date.now()}`;
      const googleEmail = `newgoogleuser-${Date.now()}@andemta.et`;

      // 1. Simulate initiation transaction in Redis
      const state = `state-${Date.now()}`;
      const nonce = `nonce-${Date.now()}`;
      const codeVerifier = `verifier-${Date.now()}`;
      redisStore.set(
        `oauth:google:state:${state}`,
        JSON.stringify({
          state,
          nonce,
          codeVerifier,
          action: 'login',
          createdAt: Date.now(),
        }),
      );

      // 2. Mock Google token exchange and ID token verification
      jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValueOnce({
        tokens: { id_token: 'valid.mocked.id.token' },
      } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: googleSub,
          email: googleEmail,
          email_verified: true,
          nonce,
        }),
      } as never);

      // 3. Execute callback request
      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?code=valid-auth-code&state=${state}`)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/auth/google/callback');

      // Verify HttpOnly refresh cookie is attached
      const setCookieHeader = res.headers['set-cookie'] as string[] | string;
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader;
      expect(cookieStr).toContain('andemta_refresh=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr.toLowerCase()).toContain('path=/api/v1/auth');

      // 4. Verify user was created in PostgreSQL
      const user = await prisma.user.findUnique({
        where: { email: googleEmail },
        include: { externalAccounts: true, sessions: true },
      });

      expect(user).toBeTruthy();
      createdUserIds.push(user!.id);
      expect(user!.passwordHash).toBeNull();
      expect(user!.emailVerifiedAt).not.toBeNull();

      // Verify external account was linked
      expect(user!.externalAccounts.length).toBe(1);
      expect(user!.externalAccounts[0].provider).toBe('google');
      expect(user!.externalAccounts[0].providerAccountId).toBe(googleSub);
      expect(user!.externalAccounts[0].providerEmail).toBe(googleEmail);

      // Verify session was created
      expect(user!.sessions.length).toBe(1);
      expect(user!.sessions[0].revokedAt).toBeNull();

      // 5. Verify the issued refresh cookie can be used at POST /api/v1/auth/refresh to receive a JWT access token!
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', [cookieStr])
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.user.email).toBe(googleEmail);
      expect(refreshRes.body.data.user.id).toBe(user!.id);
    });
  });

  describe('GET /api/v1/auth/google/callback — Case A: Existing Google Identity Login', () => {
    it('should log in existing linked Google user and issue fresh session without modifying user profile', async () => {
      const googleSub = `sub-existing-${Date.now()}`;
      const googleEmail = `existinggoogleuser-${Date.now()}@andemta.et`;

      // Pre-create user and external account in DB
      const existingUser = await prisma.user.create({
        data: {
          email: googleEmail,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          externalAccounts: {
            create: {
              provider: 'google',
              providerAccountId: googleSub,
              providerEmail: googleEmail,
            },
          },
        },
      });
      createdUserIds.push(existingUser.id);

      const state = `state-exist-${Date.now()}`;
      const nonce = `nonce-exist-${Date.now()}`;
      redisStore.set(
        `oauth:google:state:${state}`,
        JSON.stringify({
          state,
          nonce,
          codeVerifier: 'verifier',
          action: 'login',
        }),
      );

      jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValueOnce({
        tokens: { id_token: 'valid.token' },
      } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: googleSub,
          email: googleEmail,
          email_verified: true,
          nonce,
        }),
      } as never);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?code=valid-code&state=${state}`)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/auth/google/callback');
      const setCookieHeader = res.headers['set-cookie'] as string[] | string;
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader;
      expect(cookieStr).toContain('andemta_refresh=');

      // Verify session created for existing user
      const sessions = await prisma.session.findMany({
        where: { userId: existingUser.id },
      });
      expect(sessions.length).toBe(1);
    });
  });

  describe('GET /api/v1/auth/google/callback — Case C: Account Conflict (Existing Email Unlinked)', () => {
    it('should NOT automatically link: must redirect to failure URL with account_linking_required', async () => {
      const email = `conflict-user-${Date.now()}@andemta.et`;

      // User registered with password, no Google external account linked
      const existingUser = await prisma.user.create({
        data: {
          email,
          passwordHash: '$argon2id$v=19$some-hash',
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(existingUser.id);

      const state = `state-conflict-${Date.now()}`;
      const nonce = `nonce-conflict-${Date.now()}`;
      redisStore.set(
        `oauth:google:state:${state}`,
        JSON.stringify({
          state,
          nonce,
          codeVerifier: 'verifier',
          action: 'login',
        }),
      );

      jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValueOnce({
        tokens: { id_token: 'valid.token' },
      } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'new-unlinked-google-sub',
          email,
          email_verified: true,
          nonce,
        }),
      } as never);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?code=valid-code&state=${state}`)
        .expect(302);

      // Must redirect to failure URL with account_linking_required error
      expect(res.headers.location).toBe('http://localhost:3000/login?error=account_linking_required');

      // Must NOT set refresh cookie
      expect(res.headers['set-cookie']).toBeUndefined();

      // No external account must have been created
      const externalAccounts = await prisma.externalAccount.findMany({
        where: { userId: existingUser.id },
      });
      expect(externalAccounts.length).toBe(0);
    });
  });

  describe('GET /api/v1/auth/google/callback — Explicit Account Linking', () => {
    it('should successfully link Google identity to authenticated user without creating new session', async () => {
      const email = `link-target-${Date.now()}@andemta.et`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: '$argon2id$v=19$some-hash',
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(user.id);

      const googleSub = `google-sub-to-link-${Date.now()}`;
      const state = `state-link-${Date.now()}`;
      const nonce = `nonce-link-${Date.now()}`;
      redisStore.set(
        `oauth:google:state:${state}`,
        JSON.stringify({
          state,
          nonce,
          codeVerifier: 'verifier',
          action: 'link',
          userId: user.id,
        }),
      );

      jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValueOnce({
        tokens: { id_token: 'valid.token' },
      } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: googleSub,
          email,
          email_verified: true,
          nonce,
        }),
      } as never);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?code=valid-code&state=${state}`)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/auth/google/callback?linked=true');

      // External account was created
      const linkedAccount = await prisma.externalAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googleSub,
          },
        },
      });
      expect(linkedAccount).toBeTruthy();
      expect(linkedAccount?.userId).toBe(user.id);

      // No new session created for account linking
      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions.length).toBe(0);
    });

    it('should reject linking when Google identity is already linked to another user', async () => {
      const userA = await prisma.user.create({
        data: {
          email: `usera-${Date.now()}@andemta.et`,
          emailVerifiedAt: new Date(),
        },
      });
      const userB = await prisma.user.create({
        data: {
          email: `userb-${Date.now()}@andemta.et`,
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(userA.id, userB.id);

      const googleSub = `shared-sub-${Date.now()}`;
      // Google identity is already linked to user B
      await prisma.externalAccount.create({
        data: {
          userId: userB.id,
          provider: 'google',
          providerAccountId: googleSub,
          providerEmail: userB.email,
        },
      });

      // User A attempts to link the same Google sub
      const state = `state-stolen-${Date.now()}`;
      const nonce = `nonce-stolen-${Date.now()}`;
      redisStore.set(
        `oauth:google:state:${state}`,
        JSON.stringify({
          state,
          nonce,
          codeVerifier: 'verifier',
          action: 'link',
          userId: userA.id,
        }),
      );

      jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValueOnce({
        tokens: { id_token: 'valid.token' },
      } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: googleSub,
          email: userB.email,
          email_verified: true,
          nonce,
        }),
      } as never);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?code=valid-code&state=${state}`)
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:3000/login?error=account_already_linked_to_other_user',
      );
    });
  });
});
