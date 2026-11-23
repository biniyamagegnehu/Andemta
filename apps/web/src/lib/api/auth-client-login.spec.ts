import { apiClient } from './api-client';
import { authClient } from './auth-client';
import { tokenManager } from './token-manager';
import { ApiError } from './types';

describe('authClient (Login & Google OAuth API)', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('authClient.login', () => {
    it('should send POST to /auth/login with credentials and store access token in memory', async () => {
      const mockLoginResponse = {
        accessToken: 'login-jwt-token-xyz',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'usr-login-1',
          email: 'abebe@andemta.et',
          emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        },
      };

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue(mockLoginResponse);

      const result = await authClient.login({
        email: 'abebe@andemta.et',
        password: 'ValidPassword123!',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/login',
        {
          email: 'abebe@andemta.et',
          password: 'ValidPassword123!',
        },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result).toEqual(mockLoginResponse);
      // Access token must be stored in memory
      expect(tokenManager.getAccessToken()).toBe('login-jwt-token-xyz');
      expect(tokenManager.hasAccessToken()).toBe(true);
    });

    it('should throw ApiError with status 401 on invalid credentials without setting token', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Invalid email or password', 401),
      );

      await expect(
        authClient.login({
          email: 'user@andemta.et',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(ApiError);

      expect(tokenManager.hasAccessToken()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });

    it('should throw ApiError on unverified email address', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError(
          'Email verification is required before logging in. Please check your inbox.',
          401,
        ),
      );

      try {
        await authClient.login({
          email: 'unverified@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.message).toContain('Email verification is required');
      }

      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should throw ApiError on 429 Too Many Requests (rate limiting)', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Too many failed login attempts', 429),
      );

      try {
        await authClient.login({
          email: 'rate-limited@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(429);
      }
    });

    it('should throw ApiError with isNetworkError on network connection failure', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Failed to fetch', 0, [], true),
      );

      try {
        await authClient.login({
          email: 'user@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.isNetworkError).toBe(true);
      }
    });
  });

  describe('authClient.getGoogleAuthUrl', () => {
    it('should return backend /auth/google endpoint without exposing secrets', () => {
      const url = authClient.getGoogleAuthUrl();
      expect(url).toContain('/auth/google');
      // Must not expose client secret or query params in initiation URL
      expect(url).not.toContain('client_secret');
      expect(url).not.toContain('token');
    });
  });
});
