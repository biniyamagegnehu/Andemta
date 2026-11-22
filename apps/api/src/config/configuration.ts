export interface AppConfiguration {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  frontendUrl: string;
  trustProxy?: string;
  rateLimit: {
    failClosed: boolean;
  };
  swagger: {
    enabled: boolean;
  };
  database: {
    url: string;
    queryTimeoutMs: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    tlsEnabled: boolean;
  };
  email: {
    provider: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password?: string;
    from: string;
    tokenTtlMinutes: number;
    verificationUrl: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    issuer: string;
    audience: string;
  };
  auth: {
    refreshTokenTtlDays: number;
    refreshCookieName: string;
    refreshCookiePath: string;
    cookieSecure: boolean;
    cookieSameSite: 'lax' | 'strict' | 'none';
    passwordResetTokenTtlMinutes: number;
    passwordResetUrl: string;
    cleanupRetentionDays: number;
  };
  googleOAuth: {
    clientId?: string;
    clientSecret?: string;
    callbackUrl: string;
    frontendSuccessUrl: string;
    frontendFailureUrl: string;
    stateTtlSeconds: number;
  };
}

export default (): AppConfiguration => ({
  nodeEnv:
    (process.env.NODE_ENV as 'development' | 'production' | 'test') ||
    'development',
  port: parseInt(process.env.PORT || '4000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY || 'false',
  rateLimit: {
    failClosed: process.env.RATE_LIMIT_FAIL_CLOSED === 'true',
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED === 'true',
  },
  database: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/andemta_db?schema=public',
    queryTimeoutMs: parseInt(
      process.env.DATABASE_QUERY_TIMEOUT_MS || '30000',
      10,
    ),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'nodemailer',
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || undefined,
    from: process.env.EMAIL_FROM || 'Andemta <no-reply@andemta.et>',
    tokenTtlMinutes: parseInt(
      process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES || '30',
      10,
    ),
    verificationUrl:
      process.env.FRONTEND_EMAIL_VERIFICATION_URL ||
      'http://localhost:3000/verify-email',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    issuer: process.env.JWT_ISSUER || 'andemta-api',
    audience: process.env.JWT_AUDIENCE || 'andemta-client',
  },
  auth: {
    refreshTokenTtlDays: parseInt(
      process.env.AUTH_REFRESH_TOKEN_TTL_DAYS || '30',
      10,
    ),
    refreshCookieName:
      process.env.AUTH_REFRESH_COOKIE_NAME || 'andemta_refresh',
    refreshCookiePath:
      process.env.AUTH_REFRESH_COOKIE_PATH || '/api/v1/auth',
    cookieSecure:
      process.env.NODE_ENV === 'production'
        ? true
        : process.env.AUTH_COOKIE_SECURE === 'true',
    cookieSameSite:
      (process.env.AUTH_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') ||
      'lax',
    passwordResetTokenTtlMinutes: parseInt(
      process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || '30',
      10,
    ),
    passwordResetUrl:
      process.env.FRONTEND_PASSWORD_RESET_URL ||
      'http://localhost:3000/reset-password',
    cleanupRetentionDays: parseInt(
      process.env.AUTH_CLEANUP_RETENTION_DAYS || '30',
      10,
    ),
  },
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || undefined,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:4000/api/v1/auth/google/callback',
    frontendSuccessUrl:
      process.env.FRONTEND_GOOGLE_AUTH_SUCCESS_URL ||
      'http://localhost:3000/auth/google/callback',
    frontendFailureUrl:
      process.env.FRONTEND_GOOGLE_AUTH_FAILURE_URL ||
      'http://localhost:3000/login',
    stateTtlSeconds: parseInt(
      process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS || '300',
      10,
    ),
  },
});
