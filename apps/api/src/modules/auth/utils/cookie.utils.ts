import { Response, CookieOptions } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Derives standard cookie options for the refresh token cookie
 * based on application configuration.
 *
 * Security controls:
 * - httpOnly: true (prevents client-side JavaScript access / mitigates XSS)
 * - secure: true in production or when explicitly configured (HTTPS transmission only)
 * - sameSite: 'lax' (or configured value, mitigates CSRF while allowing top-level navigation)
 * - path: restricted to auth endpoints (e.g. '/api/v1/auth')
 * - maxAge: in milliseconds corresponding to AUTH_REFRESH_TOKEN_TTL_DAYS
 *
 * @param configService NestJS ConfigService
 * @returns Standard Express CookieOptions object
 */
export function getRefreshCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const ttlDays = configService.get<number>('auth.refreshTokenTtlDays') || 30;
  const secure = configService.get<boolean>('auth.cookieSecure') ?? false;
  const sameSite =
    configService.get<'lax' | 'strict' | 'none'>('auth.cookieSameSite') ||
    'lax';
  const path =
    configService.get<string>('auth.refreshCookiePath') || '/api/v1/auth';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * Attaches the opaque refresh token as an HttpOnly, SameSite, path-restricted cookie.
 *
 * @param res Express Response object
 * @param refreshToken Raw cryptographically secure refresh token
 * @param configService NestJS ConfigService
 */
export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  configService: ConfigService,
): void {
  const cookieName =
    configService.get<string>('auth.refreshCookieName') || 'andemta_refresh';
  const options = getRefreshCookieOptions(configService);
  res.cookie(cookieName, refreshToken, options);
}

/**
 * Clears the refresh token cookie by setting an expired cookie matching the same path and security attributes.
 *
 * @param res Express Response object
 * @param configService NestJS ConfigService
 */
export function clearRefreshCookie(
  res: Response,
  configService: ConfigService,
): void {
  const cookieName =
    configService.get<string>('auth.refreshCookieName') || 'andemta_refresh';
  const { maxAge: _unused, ...clearOptions } =
    getRefreshCookieOptions(configService);
  res.clearCookie(cookieName, clearOptions);
}
