import { apiClient, authClient, tokenManager, type LoginResponseData } from '@/lib/api';

describe('Auth State Integration Lifecycle', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  it('should restore session from refresh token and populate user state', async () => {
    const mockSession: LoginResponseData = {
      accessToken: 'jwt-access-abc',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr-42',
        email: 'participant@andemta.et',
        emailVerifiedAt: '2026-03-01T00:00:00.000Z',
      },
    };

    jest.spyOn(apiClient, 'post').mockResolvedValue(mockSession);

    const refreshed = await authClient.refreshSession();
    expect(refreshed).toEqual(mockSession);
    expect(tokenManager.getAccessToken()).toBe('jwt-access-abc');
  });

  it('should handle unauthenticated session restoration safely', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(null);

    const refreshed = await authClient.refreshSession();
    expect(refreshed).toBeNull();
    expect(tokenManager.getAccessToken()).toBeNull();
  });

  it('should clear token and state during logout', async () => {
    tokenManager.setAccessToken('jwt-to-logout');
    jest.spyOn(apiClient, 'request').mockResolvedValue({});

    await authClient.logout();
    expect(tokenManager.getAccessToken()).toBeNull();
  });
});
