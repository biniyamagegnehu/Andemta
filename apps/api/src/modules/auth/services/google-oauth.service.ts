import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeChallengeMethod,
  OAuth2Client,
  TokenPayload,
} from 'google-auth-library';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { SessionService } from './session.service';

export interface OAuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  action: 'login' | 'link';
  userId?: string;
  createdAt: number;
}

export interface OAuthCallbackResult {
  success: boolean;
  redirectUrl: string;
  rawRefreshToken?: string;
  error?: string;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly callbackUrl: string;
  private readonly frontendSuccessUrl: string;
  private readonly frontendFailureUrl: string;
  private readonly stateTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
  ) {
    this.clientId = this.configService.get<string>('googleOAuth.clientId');
    this.clientSecret = this.configService.get<string>(
      'googleOAuth.clientSecret',
    );
    this.callbackUrl = this.configService.get<string>(
      'googleOAuth.callbackUrl',
      'http://localhost:4000/api/v1/auth/google/callback',
    );
    this.frontendSuccessUrl = this.configService.get<string>(
      'googleOAuth.frontendSuccessUrl',
      'http://localhost:3000/auth/google/callback',
    );
    this.frontendFailureUrl = this.configService.get<string>(
      'googleOAuth.frontendFailureUrl',
      'http://localhost:3000/login',
    );
    this.stateTtlSeconds = this.configService.get<number>(
      'googleOAuth.stateTtlSeconds',
      300,
    );
  }

  /**
   * Returns whether Google OAuth is configured with valid client credentials.
   */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Constructs an instance of Google's OAuth2Client with configured credentials.
   */
  getOAuth2Client(): OAuth2Client {
    return new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.callbackUrl,
    );
  }

  private getStateRedisKey(state: string): string {
    return `oauth:google:state:${state}`;
  }

  /**
   * Maps internal technical failure reasons to safe, generic frontend error codes.
   * Prevents leaking implementation details (e.g. nonce mismatch, token exchange internals)
   * while preserving required UX error codes (account_linking_required, unverified_email).
   */
  private sanitizeErrorCode(internalReason: string): string {
    switch (internalReason) {
      case 'account_linking_required':
        return 'account_linking_required';
      case 'unverified_email':
        return 'unverified_email';
      case 'access_denied':
        return 'access_denied';
      case 'user_already_has_google_account':
        return 'user_already_has_google_account';
      case 'account_already_linked_to_other_user':
        return 'account_already_linked_to_other_user';
      case 'email_conflict':
        return 'email_conflict';
      default:
        // All internal errors (state missing/expired/corrupted, nonce mismatch, token exchange failure)
        return 'auth_failed';
    }
  }

  /**
   * Appends an error code parameter to the configured frontend failure destination URL.
   *
   * @param errorCode Machine-readable error code
   * @returns Formatted URL string
   */
  buildFailureUrl(errorCode: string): string {
    const safeCode = this.sanitizeErrorCode(errorCode);
    const url = new URL(this.frontendFailureUrl);
    url.searchParams.set('error', safeCode);
    return url.toString();
  }

  /**
   * Builds the configured frontend success destination URL with optional query parameters.
   *
   * @param params Key-value pairs to append as query parameters
   * @returns Formatted URL string
   */
  buildSuccessUrl(params?: Record<string, string>): string {
    const url = new URL(this.frontendSuccessUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  /**
   * Generates a cryptographically secure Google OAuth authorization URL.
   * Employs:
   * - 256-bit cryptographically random state parameter
   * - OpenID Connect nonce
   * - PKCE S256 code challenge and verifier
   * - Short-lived Redis persistence with atomic single-use consumption
   *
   * @param action 'login' or 'link'
   * @param userId Authenticated user UUID (required when action === 'link')
   * @returns Google OAuth authorization URL string
   */
  async generateAuthUrl(
    action: 'login' | 'link',
    userId?: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured on this server',
      );
    }

    // 1. Generate cryptographic random values
    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // 2. Derive PKCE S256 code challenge
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // 3. Store transaction in Redis with configured TTL
    const transaction: OAuthTransaction = {
      state,
      nonce,
      codeVerifier,
      action,
      userId,
      createdAt: Date.now(),
    };

    const redisKey = this.getStateRedisKey(state);
    await this.redisService
      .getClient()
      .set(redisKey, JSON.stringify(transaction), 'EX', this.stateTtlSeconds);

    // 4. Generate Google authorization URL
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
    });
  }

  /**
   * Processes the Google OAuth callback.
   * - Atomically validates and consumes the OAuth transaction state from Redis (preventing replay attacks).
   * - Exchanges authorization code for tokens using the stored PKCE code verifier.
   * - Verifies Google ID token cryptographic signature, issuer, audience, expiration, and nonce.
   * - Enforces verified email requirement.
   * - Dispatches to login/registration or account linking handler based on transaction action.
   *
   * @param code Authorization code from Google
   * @param state State parameter from Google
   * @param userAgent Optional client User-Agent
   * @param ipAddress Optional client IP
   */
  async handleCallback(
    code: string,
    state: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<OAuthCallbackResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('oauth_not_configured'),
      };
    }

    // 1. Atomic state consumption from Redis
    const redisKey = this.getStateRedisKey(state);
    const rawTransaction = await this.redisService.getClient().getdel(redisKey);

    if (!rawTransaction) {
      this.logger.warn('Google OAuth callback rejected: state missing, expired, or already used');
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('invalid_or_expired_state'),
      };
    }

    let transaction: OAuthTransaction;
    try {
      transaction = JSON.parse(rawTransaction);
    } catch {
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('corrupted_state'),
      };
    }

    // 2. Exchange authorization code for tokens using PKCE verifier
    const oauth2Client = this.getOAuth2Client();
    let tokens;
    try {
      const tokenResponse = await oauth2Client.getToken({
        code,
        codeVerifier: transaction.codeVerifier,
      });
      tokens = tokenResponse.tokens;
    } catch (exchangeError) {
      this.logger.error(
        `Failed to exchange authorization code with Google: ${(exchangeError as Error).message}`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('token_exchange_failed'),
      };
    }

    if (!tokens.id_token) {
      this.logger.error('Google token response did not contain an ID token');
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('missing_id_token'),
      };
    }

    // 3. Verify ID token signature, audience, issuer, expiration
    let payload: TokenPayload | undefined;
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      this.logger.error(
        `Google ID token verification failed: ${(verifyError as Error).message}`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('invalid_id_token'),
      };
    }

    if (!payload || !payload.sub) {
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('invalid_id_token_payload'),
      };
    }

    // 4. Verify OpenID Connect nonce against stored transaction nonce
    if (payload.nonce !== transaction.nonce) {
      this.logger.warn('Google ID token nonce mismatch detected');
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('nonce_mismatch'),
      };
    }

    // 5. Verify email presence and Google email verification status
    if (!payload.email || payload.email_verified !== true) {
      this.logger.warn(
        `Google identity rejected due to unverified email address (sub: ${payload.sub})`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('unverified_email'),
      };
    }

    // 6. Branch according to transaction action (login vs link)
    if (transaction.action === 'link') {
      return this.handleAccountLinking(transaction.userId!, payload);
    }

    return this.handleLoginOrRegistration(payload, userAgent, ipAddress);
  }

  /**
   * Handles Google login or automatic new-user registration.
   * - If Google external account exists: logs in associated user and creates a session.
   * - If no external account exists and email is unused: creates new User + ExternalAccount,
   *   sets emailVerifiedAt, and creates a session.
   * - If email belongs to an existing user: rejects automatic linking and redirects with
   *   error code 'account_linking_required'.
   */
  private async handleLoginOrRegistration(
    payload: TokenPayload,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<OAuthCallbackResult> {
    const googleSub = payload.sub;
    const normalizedEmail = payload.email!.trim().toLowerCase();

    // 1. Look up existing external account by provider + providerAccountId
    const externalAccount = await this.prisma.externalAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleSub,
        },
      },
      include: {
        user: true,
      },
    });

    // Case A: Google identity already linked to an existing Andemta user
    if (externalAccount) {
      const sessionResult = await this.sessionService.createSession(
        externalAccount.userId,
        userAgent,
        ipAddress,
      );

      this.logger.log(
        `Google login successful for user ${externalAccount.userId} via account ${externalAccount.id}`,
      );

      return {
        success: true,
        redirectUrl: this.buildSuccessUrl(),
        rawRefreshToken: sessionResult.rawRefreshToken,
      };
    }

    // Case B & C: Google identity is not yet linked
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Case C: Email belongs to an existing Andemta user — DO NOT silently link
    if (existingUser) {
      this.logger.warn(
        `Google identity (${googleSub}) attempted login with email ${normalizedEmail} which exists in Andemta. Explicit linking required.`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('account_linking_required'),
      };
    }

    // Case B: Completely new user — register user and external account transactionally
    try {
      const createdUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash: null, // Google-only users have no password
            emailVerifiedAt: new Date(), // Email is already verified by Google
          },
        });

        await tx.externalAccount.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googleSub,
            providerEmail: normalizedEmail,
          },
        });

        return user;
      });

      const sessionResult = await this.sessionService.createSession(
        createdUser.id,
        userAgent,
        ipAddress,
      );

      this.logger.log(
        `Registered new user ${createdUser.id} via Google OAuth identity ${googleSub}`,
      );

      return {
        success: true,
        redirectUrl: this.buildSuccessUrl(),
        rawRefreshToken: sessionResult.rawRefreshToken,
      };
    } catch (dbError) {
      this.logger.error(
        `Database collision during Google user registration: ${(dbError as Error).message}`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('registration_conflict'),
      };
    }
  }

  /**
   * Handles explicit account linking for an already-authenticated user.
   * - Validates target user exists.
   * - Rejects if Google identity is already linked to another user.
   * - Rejects if user already has a Google account linked.
   * - Rejects if Google email conflicts with a different user account.
   * - Links ExternalAccount record to current user without creating a new session or user.
   */
  private async handleAccountLinking(
    userId: string,
    payload: TokenPayload,
  ): Promise<OAuthCallbackResult> {
    const googleSub = payload.sub;
    const googleEmail = payload.email!.trim().toLowerCase();

    // 1. Validate target user exists
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('user_not_found'),
      };
    }

    // 2. Reject if Google identity is already linked to any user
    const existingGoogleAccount = await this.prisma.externalAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleSub,
        },
      },
    });

    if (existingGoogleAccount) {
      if (existingGoogleAccount.userId === currentUser.id) {
        return {
          success: true,
          redirectUrl: this.buildSuccessUrl({ linked: 'already_linked' }),
        };
      }
      this.logger.warn(
        `User ${currentUser.id} attempted to link Google account ${googleSub} which is already linked to user ${existingGoogleAccount.userId}`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('account_already_linked_to_other_user'),
      };
    }

    // 3. Reject if user already has a Google identity linked
    const userCurrentGoogleAccount = await this.prisma.externalAccount.findFirst({
      where: {
        userId: currentUser.id,
        provider: 'google',
      },
    });

    if (userCurrentGoogleAccount) {
      this.logger.warn(
        `User ${currentUser.id} already has a linked Google identity (${userCurrentGoogleAccount.providerAccountId})`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('user_already_has_google_account'),
      };
    }

    // 4. Reject if Google email conflicts with a different Andemta user
    if (googleEmail !== currentUser.email.toLowerCase()) {
      const conflictingUser = await this.prisma.user.findUnique({
        where: { email: googleEmail },
      });

      if (conflictingUser && conflictingUser.id !== currentUser.id) {
        this.logger.warn(
          `User ${currentUser.id} attempted to link Google account with email ${googleEmail} belonging to user ${conflictingUser.id}`,
        );
        return {
          success: false,
          redirectUrl: this.buildFailureUrl('email_conflict'),
        };
      }
    }

    // 5. Create the ExternalAccount record
    try {
      await this.prisma.externalAccount.create({
        data: {
          userId: currentUser.id,
          provider: 'google',
          providerAccountId: googleSub,
          providerEmail: googleEmail,
        },
      });

      this.logger.log(
        `Successfully linked Google identity ${googleSub} to user ${currentUser.id}`,
      );

      return {
        success: true,
        redirectUrl: this.buildSuccessUrl({ linked: 'true' }),
      };
    } catch (dbError) {
      this.logger.error(
        `Failed to link Google account to user ${currentUser.id}: ${(dbError as Error).message}`,
      );
      return {
        success: false,
        redirectUrl: this.buildFailureUrl('link_failed'),
      };
    }
  }
}
