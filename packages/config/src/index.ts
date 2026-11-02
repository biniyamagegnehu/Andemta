/**
 * @andemta/config
 * Shared configuration defaults and environment constants for Andemta.
 */

export const API_DEFAULTS = {
  PORT: 4000,
  PREFIX: 'api/v1',
  HEALTH_ROUTE: '/api/v1/health',
} as const;

export const WEB_DEFAULTS = {
  PORT: 3000,
  LOCAL_URL: 'http://localhost:3000',
} as const;

export const DATABASE_DEFAULTS = {
  DEFAULT_DATABASE: 'andemta_db',
  PORT: 5432,
} as const;

export const REDIS_DEFAULTS = {
  HOST: 'localhost',
  PORT: 6379,
} as const;

