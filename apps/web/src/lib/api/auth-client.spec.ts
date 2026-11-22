import { apiClient } from './api-client';
import {
  authClient,
  authenticatedRequest,
  refreshAccessToken,
} from './auth-client';
import { tokenManager } from './token-manager';
import { ApiError, type LoginResponseData } from './types';

describe('authClient (Single-Flight Refresh & Authenticated Requests)', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('refreshAccessToken & Single-Flight Deduplication', () => {
    it('should call POST /auth/refresh and store the returned access token in memory', async () => {
      const mockRefreshData: LoginResponseData = {
        accessToken: 'new-access-token-123',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'usr-1',
          email: 'abebe@andemta.et',
          emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        },
      };

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue(mockRefreshData);

      const result = await refreshAccessToken();

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/refresh',
        {},
        expect.objectContaining({ skipAuth: true, skipRefreshRetry: true }),
      );
      expect(result).toEqual(mockRefreshData);
      expect(tokenManager.getAccessToken()).toBe('new-access-token-123');
    });

    it('should deduplicate concurrent refresh requests into a single network flight', async () => {
      const mockRefreshData: LoginResponseData = {
        accessToken: 'shared-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'usr-1',
          email: 'concurrent@andemta.et',
          emailVerifiedAt: null,
        },
      };

      let resolver: (data: LoginResponseData) => void;
      const delayedPromise = new Promise<LoginResponseData>((resolve) => {
        resolver = resolve;
      });

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockImplementation(() => delayedPromise);

      // Launch 5 concurrent refresh requests simultaneously
      const flights = Promise.all([
        refreshAccessToken(),
        refreshAccessToken(),
        refreshAccessToken(),
        refreshAccessToken(),
        refreshAccessToken(),
      ]);

      // Resolve the single flight
      resolver!(mockRefreshData);
      const results = await flights;

      // Exactly ONE network request should have been dispatched
      expect(postSpy).toHaveBeenCalledTimes(1);
      // All 5 callers should receive the exact same resolved payload
      results.forEach((res) => {
        expect(res).toEqual(mockRefreshData);
        expect(res?.accessToken).toBe('shared-access-token');
      });
      expect(tokenManager.getAccessToken()).toBe('shared-access-token');
    });

    it('should clear in-memory token and reset flight lock if refresh fails', async () => {
      tokenManager.setAccessToken('stale-token');

      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockRejectedValue(new ApiError('Refresh token revoked', 401));

      await expect(refreshAccessToken()).rejects.toThrow(ApiError);
      expect(tokenManager.getAccessToken()).toBeNull();

      // Reset spy for subsequent call
      postSpy.mockReset();
      postSpy.mockResolvedValue({
        accessToken: 'fresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: 'usr-2', email: 'test@andemta.et', emailVerifiedAt: null },
      });

      const nextResult = await refreshAccessToken();
      expect(nextResult?.accessToken).toBe('fresh-token');
      expect(postSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('authenticatedRequest & 401 Interception', () => {
    it('should attach Authorization: Bearer <token> when token is in memory', async () => {
      tokenManager.setAccessToken('valid-access-token');

      const requestSpy = jest.spyOn(apiClient, 'request').mockResolvedValue({
        id: 'usr-1',
      });

      await authenticatedRequest('/auth/me');

      expect(requestSpy).toHaveBeenCalledWith(
        '/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
          }),
        }),
      );
    });

    it('should not attach Authorization header when in-memory token is absent', async () => {
      const requestSpy = jest.spyOn(apiClient, 'request').mockResolvedValue({
        public: true,
      });

      await authenticatedRequest('/public-data');

      expect(requestSpy).toHaveBeenCalledWith(
        '/public-data',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      );
    });

    it('should catch 401, refresh token, and retry the original request ONCE with new token', async () => {
      tokenManager.setAccessToken('expired-token');

      const mockRefreshData: LoginResponseData = {
        accessToken: 'renewed-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: 'usr-1', email: 'user@andemta.et', emailVerifiedAt: null },
      };

      // Mock apiClient.post for /auth/refresh
      jest.spyOn(apiClient, 'post').mockImplementation(async (path) => {
        if (path === '/auth/refresh') {
          return mockRefreshData;
        }
        return {};
      });

      let surveyAttempts = 0;
      const requestSpy = jest
        .spyOn(apiClient, 'request')
        .mockImplementation(async (path, options) => {
          if (path === '/surveys') {
            surveyAttempts++;
            if (surveyAttempts === 1) {
              // First attempt with expired token fails with 401
              throw new ApiError('Access token expired', 401);
            }
            // Second retry attempt succeeds with renewed token
            return {
              path,
              retriedWithToken: (options?.headers as Record<string, string>)?.Authorization,
            };
          }
          return {};
        });

      const response = await authenticatedRequest<{
        path: string;
        retriedWithToken: string;
      }>('/surveys');

      expect(surveyAttempts).toBe(2);
      expect(response.retriedWithToken).toBe('Bearer renewed-token');
      expect(requestSpy).toHaveBeenLastCalledWith(
        '/surveys',
        expect.objectContaining({
          skipRefreshRetry: true,
        }),
      );
    });

    it('should throw immediately without refreshing when skipRefreshRetry is true or path is /auth/refresh', async () => {
      const refreshSpy = jest.spyOn(apiClient, 'post');
      jest
        .spyOn(apiClient, 'request')
        .mockRejectedValue(new ApiError('Unauthorized', 401));

      await expect(
        authenticatedRequest('/auth/refresh', { skipRefreshRetry: true }),
      ).rejects.toThrow(ApiError);

      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });

  describe('authClient helper methods', () => {
    it('getCurrentUser should call /auth/me with Bearer token', async () => {
      tokenManager.setAccessToken('active-token');
      const mockUser = {
        id: 'usr-1',
        email: 'tester@andemta.et',
        emailVerifiedAt: null,
      };

      jest.spyOn(apiClient, 'request').mockResolvedValue(mockUser);

      const user = await authClient.getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    it('logout should call POST /auth/logout and clear in-memory token', async () => {
      tokenManager.setAccessToken('token-to-clear');
      expect(tokenManager.hasAccessToken()).toBe(true);

      const requestSpy = jest.spyOn(apiClient, 'request').mockResolvedValue({});

      await authClient.logout();

      expect(requestSpy).toHaveBeenCalledWith(
        '/auth/logout',
        expect.objectContaining({ method: 'POST', skipRefreshRetry: true }),
      );
      expect(tokenManager.getAccessToken()).toBeNull();
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('logout should clear in-memory token even if backend request fails', async () => {
      tokenManager.setAccessToken('token-to-clear');
      jest
        .spyOn(apiClient, 'request')
        .mockRejectedValue(new ApiError('Network error', 500));

      await authClient.logout();

      expect(tokenManager.getAccessToken()).toBeNull();
      expect(tokenManager.hasAccessToken()).toBe(false);
    });
  });
});
