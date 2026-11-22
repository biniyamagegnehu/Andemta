import { apiClient } from './api-client';
import { authClient } from './auth-client';
import { tokenManager } from './token-manager';
import { ApiError } from './types';

describe('authClient (Registration & Email Verification API)', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('authClient.register', () => {
    it('should send POST to /auth/register with skipAuth: true and unauthenticated options', async () => {
      const mockRegisteredUser = {
        id: 'usr-new-123',
        email: 'participant@andemta.et',
        emailVerifiedAt: null,
        createdAt: '2026-11-22T12:00:00.000Z',
      };

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue(mockRegisteredUser);

      const result = await authClient.register({
        email: 'participant@andemta.et',
        password: 'ValidPassword123!',
      });

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/register',
        {
          email: 'participant@andemta.et',
          password: 'ValidPassword123!',
        },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result).toEqual(mockRegisteredUser);
      // Critical check: registration MUST NOT store or create an access token
      expect(tokenManager.hasAccessToken()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });

    it('should throw ApiError with status 409 when email already exists', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('An account with this email already exists', 409),
      );

      await expect(
        authClient.register({
          email: 'existing@andemta.et',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(ApiError);

      try {
        await authClient.register({
          email: 'existing@andemta.et',
          password: 'SecurePassword123!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(409);
        expect(apiError.message).toBe('An account with this email already exists');
      }

      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should throw ApiError with validation field errors on 400 Bad Request', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Validation failed', 400, [
          { field: 'password', message: 'password must be at least 12 characters long' },
        ]),
      );

      try {
        await authClient.register({
          email: 'test@andemta.et',
          password: 'short',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.errors).toEqual([
          { field: 'password', message: 'password must be at least 12 characters long' },
        ]);
      }
    });

    it('should handle network connection errors safely', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Network connection failed', 0, [], true),
      );

      try {
        await authClient.register({
          email: 'test@andemta.et',
          password: 'ValidPassword123!',
        });
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.isNetworkError).toBe(true);
        expect(apiError.status).toBe(0);
      }
    });
  });

  describe('authClient.verifyEmail', () => {
    it('should send POST to /auth/verify-email with raw token and unauthenticated options', async () => {
      const mockVerifyResponse = {
        email: 'verified@andemta.et',
        emailVerifiedAt: '2026-11-22T12:05:00.000Z',
      };

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue(mockVerifyResponse);

      const result = await authClient.verifyEmail('valid-base64url-token');

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/verify-email',
        { token: 'valid-base64url-token' },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result).toEqual(mockVerifyResponse);
      // Email verification MUST NOT create an authenticated session automatically
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should throw ApiError with 400 when token is invalid or expired', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Invalid or expired verification token', 400),
      );

      try {
        await authClient.verifyEmail('expired-or-bad-token');
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe('Invalid or expired verification token');
      }

      expect(tokenManager.hasAccessToken()).toBe(false);
    });
  });

  describe('authClient.resendVerification', () => {
    it('should send POST to /auth/resend-verification and return generic response', async () => {
      const genericResponse = {
        message: 'If an account requires email verification, a verification email will be sent.',
      };

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue(genericResponse);

      const result = await authClient.resendVerification('user@andemta.et');

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/resend-verification',
        { email: 'user@andemta.et' },
        expect.objectContaining({
          skipAuth: true,
          skipRefreshRetry: true,
        }),
      );
      expect(result.message).toBe(
        'If an account requires email verification, a verification email will be sent.',
      );
    });

    it('should throw ApiError with status 429 when rate limited', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Too many requests', 429),
      );

      try {
        await authClient.resendVerification('spammer@andemta.et');
      } catch (err: unknown) {
        const apiError = err as ApiError;
        expect(apiError.status).toBe(429);
      }
    });
  });
});
