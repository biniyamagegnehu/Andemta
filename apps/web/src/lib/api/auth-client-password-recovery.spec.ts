import { apiClient } from './api-client';
import { authClient } from './auth-client';
import { tokenManager } from './token-manager';
import { ApiError } from './types';

describe('authClient (Password Recovery API)', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('authClient.forgotPassword', () => {
    it('should send POST to /auth/forgot-password with skipAuth: true', async () => {
      const mockResponse = {
        message: 'If an account exists for this email address, password reset instructions will be sent.',
      };

      const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await authClient.forgotPassword('user@andemta.et');

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'user@andemta.et' },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw ApiError with status 429 on rate limit', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Too many password reset requests', 429),
      );

      await expect(authClient.forgotPassword('user@andemta.et')).rejects.toThrow(ApiError);

      try {
        await authClient.forgotPassword('user@andemta.et');
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(429);
      }
    });

    it('should handle network connection failure', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Failed to fetch', 0, [], true),
      );

      try {
        await authClient.forgotPassword('user@andemta.et');
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.isNetworkError).toBe(true);
      }
    });
  });

  describe('authClient.resetPassword', () => {
    it('should send POST to /auth/reset-password and clear any existing in-memory token', async () => {
      tokenManager.setAccessToken('stale-jwt-token');
      expect(tokenManager.hasAccessToken()).toBe(true);

      const mockResponse = {
        message: 'Password has been reset successfully',
      };

      const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValue(mockResponse);

      const result = await authClient.resetPassword({
        token: 'valid-reset-token-123',
        newPassword: 'BrandNewSecurePassword123!',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/reset-password',
        {
          token: 'valid-reset-token-123',
          newPassword: 'BrandNewSecurePassword123!',
        },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result).toEqual(mockResponse);
      // Existing access token must be cleared to revoke local session
      expect(tokenManager.hasAccessToken()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });

    it('should clear in-memory token even if resetPassword fails', async () => {
      tokenManager.setAccessToken('stale-jwt-token');

      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Invalid or expired password reset token', 400),
      );

      await expect(
        authClient.resetPassword({
          token: 'bad-token',
          newPassword: 'Password123456!',
        }),
      ).rejects.toThrow(ApiError);

      expect(tokenManager.hasAccessToken()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });

    it('should throw ApiError with status 429 when rate limited', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Too many attempts', 429),
      );

      try {
        await authClient.resetPassword({
          token: 'some-token',
          newPassword: 'Password123456!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(429);
      }
    });
  });
});
