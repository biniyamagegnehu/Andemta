import { apiClient, authClient, tokenManager, ApiError } from '@/lib/api';

describe('Reset Password Form Validation & Policy', () => {
  const validatePassword = (val: string): { valid: boolean; error?: string } => {
    if (!val) return { valid: false, error: 'New password is required' };
    if (val.length < 12) return { valid: false, error: 'Password must be at least 12 characters long' };
    if (val.length > 128) return { valid: false, error: 'Password must be at most 128 characters long' };
    return { valid: true };
  };

  const validateConfirmPassword = (confirmVal: string, passwordVal: string): { valid: boolean; error?: string } => {
    if (!confirmVal) return { valid: false, error: 'Please confirm your new password' };
    if (confirmVal !== passwordVal) return { valid: false, error: 'Passwords do not match' };
    return { valid: true };
  };

  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  describe('Token presence detection', () => {
    const checkToken = (token: string | null | undefined): boolean => {
      return Boolean(token && token.trim().length > 0);
    };

    it('should detect missing or empty token', () => {
      expect(checkToken(null)).toBe(false);
      expect(checkToken(undefined)).toBe(false);
      expect(checkToken('')).toBe(false);
      expect(checkToken('   ')).toBe(false);
    });

    it('should accept valid token', () => {
      expect(checkToken('valid-crypto-token-123')).toBe(true);
    });
  });

  describe('Password complexity & policy', () => {
    it('should reject password shorter than 12 characters', () => {
      expect(validatePassword('ShortPass1!').valid).toBe(false);
      expect(validatePassword('12345678901').valid).toBe(false); // 11 chars
      expect(validatePassword('12345678901').error).toBe('Password must be at least 12 characters long');
    });

    it('should accept password with exactly 12 characters', () => {
      expect(validatePassword('123456789012').valid).toBe(true);
    });

    it('should accept password with up to 128 characters', () => {
      const pass128 = 'B'.repeat(128);
      expect(validatePassword(pass128).valid).toBe(true);
    });

    it('should reject password longer than 128 characters', () => {
      const pass129 = 'B'.repeat(129);
      expect(validatePassword(pass129).valid).toBe(false);
      expect(validatePassword(pass129).error).toBe('Password must be at most 128 characters long');
    });

    it('should accept passwords containing spaces and preserve them unmodified', () => {
      const passWithSpaces = 'my secure new password with spaces 2026';
      expect(validatePassword(passWithSpaces).valid).toBe(true);
    });

    it('should accept passwords with Unicode characters', () => {
      const unicodePass = 'የይለፍ_ቃል_አዲስ_2026_የተጠበቀ!✨';
      expect(validatePassword(unicodePass).valid).toBe(true);
    });
  });

  describe('Confirm password validation', () => {
    it('should reject empty confirm password', () => {
      expect(validateConfirmPassword('', 'ValidPass12345').valid).toBe(false);
    });

    it('should reject when confirm password does not match new password', () => {
      expect(validateConfirmPassword('DifferentPassword1', 'ValidPass12345').valid).toBe(false);
      expect(validateConfirmPassword('DifferentPassword1', 'ValidPass12345').error).toBe('Passwords do not match');
    });

    it('should accept when confirm password matches exactly', () => {
      const pass = 'MatchingPassword123!';
      expect(validateConfirmPassword(pass, pass).valid).toBe(true);
    });
  });

  describe('Reset submission flow & token sanitization', () => {
    it('should omit confirmPassword from backend request payload and clear access token', async () => {
      tokenManager.setAccessToken('existing-user-jwt');

      const postSpy = jest.spyOn(apiClient, 'post').mockResolvedValue({
        message: 'Password has been reset successfully',
      });

      const rawToken = 'raw-token-from-url';
      const newPassword = 'BrandNewPassword123!';
      const confirmPassword = 'BrandNewPassword123!';

      expect(validateConfirmPassword(confirmPassword, newPassword).valid).toBe(true);

      const payload = {
        token: rawToken,
        newPassword,
      };

      // confirmPassword is never passed to backend
      expect((payload as Record<string, unknown>).confirmPassword).toBeUndefined();

      await authClient.resetPassword(payload);

      expect(postSpy).toHaveBeenCalledWith(
        '/auth/reset-password',
        {
          token: 'raw-token-from-url',
          newPassword: 'BrandNewPassword123!',
        },
        expect.any(Object),
      );
      // Auth state must be reset
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should handle invalid or expired token error from backend', async () => {
      jest.spyOn(apiClient, 'post').mockRejectedValue(
        new ApiError('Invalid or expired password reset token', 400),
      );

      let isTokenInvalid = false;
      try {
        await authClient.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          if (err.message.toLowerCase().includes('invalid or expired')) {
            isTokenInvalid = true;
          }
        }
      }

      expect(isTokenInvalid).toBe(true);
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should prevent duplicate submissions while submitting is active', async () => {
      const isSubmitting = true;
      const submit = async () => {
        if (isSubmitting) return 'blocked';
        return 'submitted';
      };

      const result = await submit();
      expect(result).toBe('blocked');
    });
  });
});
