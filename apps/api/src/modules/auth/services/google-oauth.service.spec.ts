import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthService } from './google-oauth.service';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { SessionService } from './session.service';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  let configServiceMock: {
    get: jest.Mock;
  };
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    externalAccount: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let redisClientMock: {
    set: jest.Mock;
    getdel: jest.Mock;
  };
  let redisServiceMock: {
    getClient: jest.Mock;
  };
  let sessionServiceMock: {
    createSession: jest.Mock;
  };

  const defaultClientId = 'test-google-client-id.apps.googleusercontent.com';
  const defaultClientSecret = 'test-google-client-secret-12345';
  const defaultCallbackUrl = 'http://localhost:4000/api/v1/auth/google/callback';
  const defaultSuccessUrl = 'http://localhost:3000/auth/google/callback';
  const defaultFailureUrl = 'http://localhost:3000/login';
  const defaultStateTtl = 300;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          'googleOAuth.clientId': defaultClientId,
          'googleOAuth.clientSecret': defaultClientSecret,
          'googleOAuth.callbackUrl': defaultCallbackUrl,
          'googleOAuth.frontendSuccessUrl': defaultSuccessUrl,
          'googleOAuth.frontendFailureUrl': defaultFailureUrl,
          'googleOAuth.stateTtlSeconds': defaultStateTtl,
        };
        return config[key] ?? defaultValue;
      }),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      externalAccount: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    redisClientMock = {
      set: jest.fn().mockResolvedValue('OK'),
      getdel: jest.fn(),
    };

    redisServiceMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };

    sessionServiceMock = {
      createSession: jest.fn().mockResolvedValue({
        rawRefreshToken: 'raw-refresh-token-value',
        session: { id: 'session-uuid-1' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisServiceMock },
        { provide: SessionService, useValue: sessionServiceMock },
      ],
    }).compile();

    service = module.get<GoogleOAuthService>(GoogleOAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('should return true when clientId and clientSecret are both present', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when clientId or clientSecret is missing', async () => {
      const emptyConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };
      const unconfiguredService = new GoogleOAuthService(
        emptyConfigService as unknown as ConfigService,
        prismaMock as unknown as PrismaService,
        redisServiceMock as unknown as RedisService,
        sessionServiceMock as unknown as SessionService,
      );
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  describe('generateAuthUrl', () => {
    it('should throw ServiceUnavailableException when Google OAuth is not configured', async () => {
      jest.spyOn(service, 'isConfigured').mockReturnValue(false);

      await expect(service.generateAuthUrl('login')).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.generateAuthUrl('login')).rejects.toThrow(
        'Google OAuth is not configured on this server',
      );
    });

    it('should generate unpredictable state and nonce, compute PKCE challenge, and store transaction in Redis', async () => {
      const authUrl = await service.generateAuthUrl('login');

      expect(typeof authUrl).toBe('string');
      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain(`client_id=${encodeURIComponent(defaultClientId)}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(defaultCallbackUrl)}`);
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('scope=openid%20email%20profile');
      expect(authUrl).toContain('code_challenge_method=S256');

      // Verify transaction was saved in Redis with 300s TTL
      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [redisKey, rawPayload, exFlag, ttl] = redisClientMock.set.mock.calls[0];

      expect(redisKey).toMatch(/^oauth:google:state:[A-Za-z0-9_-]+$/);
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(300);

      const parsed = JSON.parse(rawPayload);
      expect(parsed.action).toBe('login');
      expect(parsed.state).toBeDefined();
      expect(parsed.nonce).toBeDefined();
      expect(parsed.codeVerifier).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
    });

    it('should bind authenticated userId when action is "link"', async () => {
      const userId = 'user-uuid-to-link';
      await service.generateAuthUrl('link', userId);

      const rawPayload = redisClientMock.set.mock.calls[0][1];
      const parsed = JSON.parse(rawPayload);
      expect(parsed.action).toBe('link');
      expect(parsed.userId).toBe(userId);
    });
  });

  describe('handleCallback — Validation & Error Defenses', () => {
    it('should redirect to failure URL with generic auth_failed when not configured', async () => {
      jest.spyOn(service, 'isConfigured').mockReturnValue(false);

      const result = await service.handleCallback('code', 'state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=auth_failed`);
    });

    it('should redirect to failure URL with generic auth_failed when state is not found in Redis', async () => {
      redisClientMock.getdel.mockResolvedValue(null);

      const result = await service.handleCallback('valid-code', 'nonexistent-or-expired-state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=auth_failed`);
      expect(redisClientMock.getdel).toHaveBeenCalledWith('oauth:google:state:nonexistent-or-expired-state');
    });

    it('should redirect to failure URL with generic auth_failed when token exchange with Google fails', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockRejectedValue(new Error('Invalid grant: code has expired') as never);

      const result = await service.handleCallback('bad-code', 'valid-state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=auth_failed`);
    });

    it('should redirect to failure URL with generic auth_failed when ID token verification fails', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'tampered.jwt.token' } } as never);

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockRejectedValue(new Error('Invalid token signature') as never);

      const result = await service.handleCallback('code', 'valid-state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=auth_failed`);
    });

    it('should reject when ID token nonce does not match transaction nonce (sanitized to auth_failed)', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'expected-nonce-value',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'user@andemta.et',
          email_verified: true,
          nonce: 'different-mismatched-nonce',
        }),
      } as never);

      const result = await service.handleCallback('code', 'valid-state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=auth_failed`);
    });

    it('should reject when Google email is not verified (unverified email defense)', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'unverified@andemta.et',
          email_verified: false,
          nonce: 'valid-nonce',
        }),
      } as never);

      const result = await service.handleCallback('code', 'valid-state');
      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=unverified_email`);
    });
  });

  describe('handleCallback — Case A: Existing Google Identity', () => {
    it('should authenticate existing linked user and create session without modifying account', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-existing',
          email: 'existing@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      prismaMock.externalAccount.findUnique.mockResolvedValue({
        id: 'external-uuid-1',
        userId: 'user-uuid-existing',
        provider: 'google',
        providerAccountId: 'google-sub-existing',
        user: { id: 'user-uuid-existing', email: 'existing@andemta.et' },
      });

      const result = await service.handleCallback(
        'code',
        'valid-state',
        'jest-agent',
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe(defaultSuccessUrl);
      expect(result.rawRefreshToken).toBe('raw-refresh-token-value');
      expect(sessionServiceMock.createSession).toHaveBeenCalledWith(
        'user-uuid-existing',
        'jest-agent',
        '127.0.0.1',
      );
      // No new user created
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback — Case B: New Google Identity & Unused Email', () => {
    it('should create new user with null passwordHash, set emailVerifiedAt, create ExternalAccount, and create session', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-brand-new',
          email: 'newuser@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      // External account not found
      prismaMock.externalAccount.findUnique.mockResolvedValue(null);
      // User with email not found
      prismaMock.user.findUnique.mockResolvedValue(null);

      const createdUser = {
        id: 'new-user-uuid',
        email: 'newuser@andemta.et',
        passwordHash: null,
        emailVerifiedAt: new Date(),
      };
      prismaMock.user.create.mockResolvedValue(createdUser);
      prismaMock.externalAccount.create.mockResolvedValue({
        id: 'ext-uuid-new',
        userId: createdUser.id,
        provider: 'google',
        providerAccountId: 'google-sub-brand-new',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe(defaultSuccessUrl);
      expect(result.rawRefreshToken).toBe('raw-refresh-token-value');

      // Verify user created with passwordHash: null and verified timestamp
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'newuser@andemta.et',
          passwordHash: null,
          emailVerifiedAt: expect.any(Date),
        },
      });

      // Verify external account record created
      expect(prismaMock.externalAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 'new-user-uuid',
          provider: 'google',
          providerAccountId: 'google-sub-brand-new',
          providerEmail: 'newuser@andemta.et',
        },
      });

      expect(sessionServiceMock.createSession).toHaveBeenCalledWith(
        'new-user-uuid',
        undefined,
        undefined,
      );
    });
  });

  describe('handleCallback — Case C: Email Belongs to Existing Andemta Account', () => {
    it('should NOT silently link accounts: must reject and redirect to failure destination with account_linking_required', async () => {
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'login',
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-unlinked',
          email: 'existing-password-user@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      // External account does NOT exist
      prismaMock.externalAccount.findUnique.mockResolvedValue(null);
      // But user DOES exist in Andemta with this email!
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user-uuid',
        email: 'existing-password-user@andemta.et',
        passwordHash: '$argon2id$v=19$some-hash',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(
        `${defaultFailureUrl}?error=account_linking_required`,
      );

      // Must NOT authenticate as that user
      expect(sessionServiceMock.createSession).not.toHaveBeenCalled();
      // Must NOT create a second user or modify external accounts
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.externalAccount.create).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback — Account Linking (action: "link")', () => {
    it('should link new Google identity to currently authenticated user', async () => {
      const authenticatedUserId = 'auth-user-uuid';
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'link',
        userId: authenticatedUserId,
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-to-link',
          email: 'authuser@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      // User exists
      prismaMock.user.findUnique.mockResolvedValue({
        id: authenticatedUserId,
        email: 'authuser@andemta.et',
      });
      // Google identity is not linked to anyone
      prismaMock.externalAccount.findUnique.mockResolvedValue(null);
      // User does not have a Google account yet
      prismaMock.externalAccount.findFirst.mockResolvedValue(null);
      prismaMock.externalAccount.create.mockResolvedValue({
        id: 'new-ext-uuid',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe(`${defaultSuccessUrl}?linked=true`);
      expect(prismaMock.externalAccount.create).toHaveBeenCalledWith({
        data: {
          userId: authenticatedUserId,
          provider: 'google',
          providerAccountId: 'google-sub-to-link',
          providerEmail: 'authuser@andemta.et',
        },
      });

      // Account linking does NOT create a new session
      expect(sessionServiceMock.createSession).not.toHaveBeenCalled();
      // Account linking does NOT create a new user
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('should reject linking when Google identity is already linked to another user', async () => {
      const authenticatedUserId = 'user-1';
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'link',
        userId: authenticatedUserId,
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-stolen',
          email: 'user@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      prismaMock.user.findUnique.mockResolvedValue({
        id: authenticatedUserId,
        email: 'user1@andemta.et',
      });
      // Google sub is linked to user-2!
      prismaMock.externalAccount.findUnique.mockResolvedValue({
        id: 'ext-uuid',
        userId: 'user-2',
        provider: 'google',
        providerAccountId: 'google-sub-stolen',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(
        `${defaultFailureUrl}?error=account_already_linked_to_other_user`,
      );
      expect(prismaMock.externalAccount.create).not.toHaveBeenCalled();
    });

    it('should return already_linked if Google identity is already linked to the current user', async () => {
      const authenticatedUserId = 'user-1';
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'link',
        userId: authenticatedUserId,
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-mine',
          email: 'user1@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      prismaMock.user.findUnique.mockResolvedValue({
        id: authenticatedUserId,
        email: 'user1@andemta.et',
      });
      prismaMock.externalAccount.findUnique.mockResolvedValue({
        id: 'ext-uuid',
        userId: authenticatedUserId,
        provider: 'google',
        providerAccountId: 'google-sub-mine',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe(`${defaultSuccessUrl}?linked=already_linked`);
    });

    it('should reject linking if current user already has another Google account linked', async () => {
      const authenticatedUserId = 'user-1';
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'link',
        userId: authenticatedUserId,
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'new-google-sub',
          email: 'user1@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      prismaMock.user.findUnique.mockResolvedValue({
        id: authenticatedUserId,
        email: 'user1@andemta.et',
      });
      prismaMock.externalAccount.findUnique.mockResolvedValue(null);
      // User already has a linked Google account
      prismaMock.externalAccount.findFirst.mockResolvedValue({
        id: 'existing-google-link',
        userId: authenticatedUserId,
        provider: 'google',
        providerAccountId: 'old-google-sub',
      });

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(
        `${defaultFailureUrl}?error=user_already_has_google_account`,
      );
    });

    it('should reject linking if Google email conflicts with a different Andemta user', async () => {
      const authenticatedUserId = 'user-1';
      const transaction = {
        state: 'valid-state',
        nonce: 'valid-nonce',
        codeVerifier: 'valid-verifier',
        action: 'link',
        userId: authenticatedUserId,
      };
      redisClientMock.getdel.mockResolvedValue(JSON.stringify(transaction));

      jest
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { id_token: 'valid.id.token' } } as never);

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-diff-email',
          email: 'conflict@andemta.et',
          email_verified: true,
          nonce: 'valid-nonce',
        }),
      } as never);

      // User 1 lookup
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: authenticatedUserId,
          email: 'user1@andemta.et',
        })
        // Conflicting email belongs to user-2!
        .mockResolvedValueOnce({
          id: 'user-2',
          email: 'conflict@andemta.et',
        });

      prismaMock.externalAccount.findUnique.mockResolvedValue(null);
      prismaMock.externalAccount.findFirst.mockResolvedValue(null);

      const result = await service.handleCallback('code', 'valid-state');

      expect(result.success).toBe(false);
      expect(result.redirectUrl).toBe(`${defaultFailureUrl}?error=email_conflict`);
    });
  });
});
