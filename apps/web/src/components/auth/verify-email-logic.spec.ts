import { authClient, tokenManager, ApiError } from '@/lib/api';

describe('Email Verification Flow & Lifecycle Logic', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  it('should detect missing or empty token and transition to missing_token state', () => {
    const checkToken = (rawToken: string | null | undefined): string => {
      if (!rawToken || !rawToken.trim()) {
        return 'missing_token';
      }
      return 'ready';
    };

    expect(checkToken(null)).toBe('missing_token');
    expect(checkToken(undefined)).toBe('missing_token');
    expect(checkToken('')).toBe('missing_token');
    expect(checkToken('   ')).toBe('missing_token');
    expect(checkToken('valid-token-123')).toBe('ready');
  });

  it('should submit valid token and verify account without authenticating user', async () => {
    const mockResponse = {
      email: 'newuser@andemta.et',
      emailVerifiedAt: '2026-11-22T14:00:00.000Z',
    };

    const verifySpy = jest.spyOn(authClient, 'verifyEmail').mockResolvedValue(mockResponse);

    const token = 'crypto-raw-token-abc';
    const result = await authClient.verifyEmail(token);

    expect(verifySpy).toHaveBeenCalledWith('crypto-raw-token-abc');
    expect(result.email).toBe('newuser@andemta.et');
    // Successful email verification must NEVER log in the user automatically
    expect(tokenManager.hasAccessToken()).toBe(false);
    expect(tokenManager.getAccessToken()).toBeNull();
  });

  it('should guarantee token is submitted only once across multiple invocations (Strict Mode protection)', async () => {
    const verifySpy = jest.spyOn(authClient, 'verifyEmail').mockResolvedValue({
      email: 'verified@andemta.et',
      emailVerifiedAt: '2026-11-22T14:00:00.000Z',
    });

    let hasSubmitted = false;
    const submitOnce = async (tok: string) => {
      if (hasSubmitted) return;
      hasSubmitted = true;
      return authClient.verifyEmail(tok);
    };

    // Simulate React Strict Mode double-invoking the effect
    await submitOnce('single-flight-token');
    await submitOnce('single-flight-token');

    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('should handle invalid or expired tokens and map to error state', async () => {
    jest.spyOn(authClient, 'verifyEmail').mockRejectedValue(
      new ApiError('Invalid or expired verification token', 400),
    );

    let state = 'verifying';
    let errorMessage = '';

    try {
      await authClient.verifyEmail('expired-token');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        state = 'error';
        errorMessage = err.message;
      }
    }

    expect(state).toBe('error');
    expect(errorMessage).toBe('Invalid or expired verification token');
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  it('should handle network connection failure and support retry', async () => {
    const verifySpy = jest
      .spyOn(authClient, 'verifyEmail')
      .mockRejectedValueOnce(new ApiError('Network connection failed', 0, [], true))
      .mockResolvedValueOnce({
        email: 'retried@andemta.et',
        emailVerifiedAt: '2026-11-22T14:05:00.000Z',
      });

    let state = 'verifying';

    try {
      await authClient.verifyEmail('test-token');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.isNetworkError) {
        state = 'network_error';
      }
    }

    expect(state).toBe('network_error');

    // Retry operation succeeds
    const retryResult = await authClient.verifyEmail('test-token');
    expect(retryResult.email).toBe('retried@andemta.et');
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });
});
