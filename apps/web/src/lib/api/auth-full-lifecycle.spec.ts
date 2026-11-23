import { apiClient, authClient, tokenManager } from './index';
import { ApiError } from './types';

describe('Phase 3.14 — Frontend Auth Client Cross-System Lifecycle', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  it('should execute end-to-end frontend authentication flows with standard envelopes', async () => {
    // 1. Registration
    const regPayload = {
      id: 'usr-100',
      email: 'frontend-test@andemta.et',
      emailVerifiedAt: null,
      createdAt: '2026-11-23T00:00:00.000Z',
    };
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce(regPayload);

    const regResult = await authClient.register({
      email: 'frontend-test@andemta.et',
      password: 'StrongP@ssw0rd123!',
    });
    expect(regResult).toEqual(regPayload);
    expect(tokenManager.getAccessToken()).toBeNull();

    // 2. Email Verification
    const verifyPayload = {
      email: 'frontend-test@andemta.et',
      emailVerifiedAt: '2026-11-23T01:00:00.000Z',
    };
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce(verifyPayload);

    const verifyResult = await authClient.verifyEmail('valid-verification-token');
    expect(verifyResult).toEqual(verifyPayload);

    // 3. Resend Verification
    const resendPayload = {
      message: 'If the email is registered and unverified, a verification link has been sent.',
    };
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce(resendPayload);

    const resendResult = await authClient.resendVerification('frontend-test@andemta.et');
    expect(resendResult).toEqual(resendPayload);

    // 4. Login
    const loginPayload = {
      accessToken: 'initial-access-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr-100',
        email: 'frontend-test@andemta.et',
        emailVerifiedAt: '2026-11-23T01:00:00.000Z',
      },
    };
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce(loginPayload);

    const loginResult = await authClient.login({
      email: 'frontend-test@andemta.et',
      password: 'StrongP@ssw0rd123!',
    });
    expect(loginResult).toEqual(loginPayload);
    expect(tokenManager.getAccessToken()).toBe('initial-access-jwt');

    // 5. Current User Access
    const requestSpy = jest.spyOn(apiClient, 'request').mockResolvedValueOnce(loginPayload.user);

    const currentUser = await authClient.getCurrentUser();
    expect(currentUser).toEqual(loginPayload.user);
    requestSpy.mockClear();

    // 6. Automatic 401 Interception and Single-Flight Refresh Retry
    // First request fails with 401 Unauthorized
    // Interceptor refreshes session
    // Retry succeeds with new data
    const refreshedSession = {
      accessToken: 'refreshed-access-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: loginPayload.user,
    };

    requestSpy
      .mockRejectedValueOnce(new ApiError('Unauthorized', 401)) // 1st attempt fails
      .mockResolvedValueOnce({ protectedData: 'success' }); // retry succeeds

    jest.spyOn(apiClient, 'post').mockResolvedValueOnce(refreshedSession); // refresh endpoint succeeds

    const authenticatedResult = await authClient.get<{ protectedData: string }>('/protected-resource');
    expect(authenticatedResult).toEqual({ protectedData: 'success' });
    expect(tokenManager.getAccessToken()).toBe('refreshed-access-jwt');
    expect(requestSpy).toHaveBeenCalledTimes(2);

    // 7. Password Recovery Request
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      message: 'If the email is registered, instructions to reset your password have been sent.',
    });

    const forgotResult = await authClient.forgotPassword('frontend-test@andemta.et');
    expect(forgotResult).toBeDefined();

    // 8. Password Reset (clears in-memory token)
    jest.spyOn(apiClient, 'post').mockResolvedValueOnce({
      message: 'Password reset successful. Please log in with your new credentials.',
    });

    await authClient.resetPassword({
      token: 'valid-reset-token',
      newPassword: 'NewStrongP@ssw0rd123!',
    });
    expect(tokenManager.getAccessToken()).toBeNull();

    // 9. Logout (calls backend and clears token)
    tokenManager.setAccessToken('temporary-token');
    jest.spyOn(apiClient, 'request').mockResolvedValueOnce({});

    await authClient.logout();
    expect(tokenManager.getAccessToken()).toBeNull();
  });

  it('should handle refresh token expiration gracefully by clearing in-memory token', async () => {
    tokenManager.setAccessToken('expired-access-token');

    // GET /auth/me fails with 401
    // refreshAccessToken fails with 401
    jest.spyOn(apiClient, 'request').mockRejectedValueOnce(new ApiError('Unauthorized', 401));
    jest.spyOn(apiClient, 'post').mockRejectedValueOnce(new ApiError('Refresh token expired', 401));

    await expect(authClient.getCurrentUser()).rejects.toThrow(ApiError);
    expect(tokenManager.getAccessToken()).toBeNull();
  });
});
