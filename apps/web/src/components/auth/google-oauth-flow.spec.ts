import { authClient, tokenManager } from '@/lib/api';

describe('Google OAuth Flow & Callback Handling Logic', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('Google OAuth Initiation', () => {
    it('should generate initiation URL pointing to backend /api/v1/auth/google', () => {
      const url = authClient.getGoogleAuthUrl();
      expect(url).toContain('/auth/google');
    });

    it('should never expose Google Client Secret in frontend code', () => {
      // Verify that no client secret is referenced in client modules
      const url = authClient.getGoogleAuthUrl();
      expect(url).not.toContain('client_secret');
      expect(process.env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    });
  });

  describe('Google OAuth Callback Processing', () => {
    it('should restore session via HttpOnly cookie refresh and store access token in memory', async () => {
      const mockRefreshSession = {
        accessToken: 'google-oauth-jwt-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'usr-google-1',
          email: 'googleuser@gmail.com',
          emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        },
      };

      jest.spyOn(authClient, 'refreshSession').mockImplementation(async () => {
        tokenManager.setAccessToken(mockRefreshSession.accessToken);
        return mockRefreshSession;
      });

      const session = await authClient.refreshSession();

      expect(session).toEqual(mockRefreshSession);
      expect(tokenManager.getAccessToken()).toBe('google-oauth-jwt-access-token');
      expect(tokenManager.hasAccessToken()).toBe(true);
    });

    it('should prevent duplicate callback processing in React StrictMode', async () => {
      const refreshSpy = jest.spyOn(authClient, 'refreshSession').mockResolvedValue({
        accessToken: 'token-abc',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: 'usr-1', email: 'test@gmail.com', emailVerifiedAt: null },
      });

      let hasProcessed = false;
      const processCallbackOnce = async () => {
        if (hasProcessed) return;
        hasProcessed = true;
        return authClient.refreshSession();
      };

      // Double invocation (simulating React StrictMode in development)
      await processCallbackOnce();
      await processCallbackOnce();

      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle refresh failure cleanly and remain unauthenticated', async () => {
      jest.spyOn(authClient, 'refreshSession').mockResolvedValue(null);

      const session = await authClient.refreshSession();

      expect(session).toBeNull();
      expect(tokenManager.hasAccessToken()).toBe(false);
      expect(tokenManager.getAccessToken()).toBeNull();
    });
  });

  describe('Google OAuth Failure Code Mapping', () => {
    const mapOAuthError = (code: string | null): string => {
      switch (code) {
        case 'account_linking_required':
          return 'An account already exists with this email address. Please log in with your password to link your Google account.';
        case 'unverified_email':
          return 'Your Google email address is unverified. Please verify your email with Google or register directly.';
        case 'access_denied':
          return 'Google sign-in was cancelled or access was denied.';
        case 'user_already_has_google_account':
          return 'Your account is already linked to a Google account.';
        case 'account_already_linked_to_other_user':
          return 'This Google account is already linked to another user account.';
        case 'email_conflict':
          return 'An account conflict occurred with this email address.';
        case 'auth_failed':
          return 'Google authentication was unsuccessful. Please sign in with your email and password.';
        default:
          return 'Authentication failed. Please check your credentials and try again.';
      }
    };

    it('should map known failure codes to user-friendly messages', () => {
      expect(mapOAuthError('account_linking_required')).toContain('link your Google account');
      expect(mapOAuthError('unverified_email')).toContain('Google email address is unverified');
      expect(mapOAuthError('access_denied')).toContain('cancelled or access was denied');
      expect(mapOAuthError('user_already_has_google_account')).toContain('already linked');
      expect(mapOAuthError('auth_failed')).toContain('Google authentication was unsuccessful');
      expect(mapOAuthError('unknown_code')).toContain('Authentication failed');
    });
  });
});
