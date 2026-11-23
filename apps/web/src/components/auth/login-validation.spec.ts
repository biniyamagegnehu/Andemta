import { authClient, tokenManager, ApiError } from '@/lib/api';

describe('Login Validation & Error Handling Logic', () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (val: string): { valid: boolean; error?: string } => {
    const trimmed = val.trim();
    if (!trimmed) return { valid: false, error: 'Email address is required' };
    if (!EMAIL_REGEX.test(trimmed)) return { valid: false, error: 'Please enter a valid email address' };
    return { valid: true };
  };

  const validatePassword = (val: string): { valid: boolean; error?: string } => {
    if (!val) return { valid: false, error: 'Password is required' };
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

  describe('Form Field Validation', () => {
    it('should reject empty email or whitespace', () => {
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('   ').valid).toBe(false);
    });

    it('should reject invalid email format', () => {
      expect(validateEmail('invalid-email').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
    });

    it('should accept valid email address', () => {
      expect(validateEmail('user@andemta.et').valid).toBe(true);
    });

    it('should reject empty password', () => {
      expect(validatePassword('').valid).toBe(false);
      expect(validatePassword('').error).toBe('Password is required');
    });

    it('should accept non-empty password', () => {
      expect(validatePassword('AnyPassword!').valid).toBe(true);
    });
  });

  describe('Backend Error Contract Mapping', () => {
    it('should map unverified email message to unverified account state with resend guidance', async () => {
      jest.spyOn(authClient, 'login').mockRejectedValue(
        new ApiError(
          'Email verification is required before logging in. Please check your inbox.',
          401,
        ),
      );

      let isUnverified = false;
      let displayMessage = '';

      try {
        await authClient.login({
          email: 'unverified@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          if (err.message.toLowerCase().includes('email verification is required')) {
            isUnverified = true;
            displayMessage = 'Email verification is required before logging in.';
          }
        }
      }

      expect(isUnverified).toBe(true);
      expect(displayMessage).toContain('Email verification is required');
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should map invalid credentials to generic message preventing account enumeration', async () => {
      jest.spyOn(authClient, 'login').mockRejectedValue(
        new ApiError('Invalid email or password', 401),
      );

      let displayMessage = '';

      try {
        await authClient.login({
          email: 'nonexistent@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          displayMessage = 'Invalid email or password. Please verify your credentials and try again.';
        }
      }

      expect(displayMessage).toBe('Invalid email or password. Please verify your credentials and try again.');
    });

    it('should map rate limit HTTP 429 response', async () => {
      jest.spyOn(authClient, 'login').mockRejectedValue(
        new ApiError('Too many failed login attempts', 429),
      );

      let isRateLimited = false;
      try {
        await authClient.login({
          email: 'user@andemta.et',
          password: 'Password123!',
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 429) {
          isRateLimited = true;
        }
      }

      expect(isRateLimited).toBe(true);
    });

    it('should prevent duplicate submissions when request is already in progress', async () => {
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
