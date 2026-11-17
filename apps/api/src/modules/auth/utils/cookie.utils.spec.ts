import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  getRefreshCookieOptions,
  setRefreshCookie,
  clearRefreshCookie,
} from './cookie.utils';

describe('cookie.utils', () => {
  let mockConfigService: {
    get: jest.Mock;
  };
  let mockResponse: {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'auth.refreshTokenTtlDays') return 30;
        if (key === 'auth.cookieSecure') return true;
        if (key === 'auth.cookieSameSite') return 'lax';
        if (key === 'auth.refreshCookiePath') return '/api/v1/auth';
        if (key === 'auth.refreshCookieName') return 'andemta_refresh';
        return undefined;
      }),
    };

    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  });

  describe('getRefreshCookieOptions', () => {
    it('should derive options with httpOnly, secure, sameSite, path, and maxAge', () => {
      const options = getRefreshCookieOptions(
        mockConfigService as unknown as ConfigService,
      );

      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    });

    it('should fall back to defaults when config values are not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const options = getRefreshCookieOptions(
        mockConfigService as unknown as ConfigService,
      );

      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    });
  });

  describe('setRefreshCookie', () => {
    it('should call res.cookie with the configured name, raw token, and options', () => {
      setRefreshCookie(
        mockResponse as unknown as Response,
        'mock-raw-refresh-token',
        mockConfigService as unknown as ConfigService,
      );

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'andemta_refresh',
        'mock-raw-refresh-token',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        },
      );
    });
  });

  describe('clearRefreshCookie', () => {
    it('should call res.clearCookie with the configured name and matching options without maxAge', () => {
      clearRefreshCookie(
        mockResponse as unknown as Response,
        mockConfigService as unknown as ConfigService,
      );

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('andemta_refresh', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      });
    });
  });
});
