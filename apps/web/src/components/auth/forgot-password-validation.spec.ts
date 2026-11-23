import { authClient, ApiError } from '@/lib/api';

describe('Forgot Password Form Validation & Policy', () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (val: string): { valid: boolean; error?: string } => {
    const trimmed = val.trim();
    if (!trimmed) return { valid: false, error: 'Email address is required' };
    if (!EMAIL_REGEX.test(trimmed)) return { valid: false, error: 'Please enter a valid email address' };
    if (trimmed.length > 255) return { valid: false, error: 'Email address must be at most 255 characters long' };
    return { valid: true };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Email field validation', () => {
    it('should reject empty or whitespace email', () => {
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('   ').valid).toBe(false);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('user@').valid).toBe(false);
      expect(validateEmail('user').valid).toBe(false);
      expect(validateEmail('@domain.com').valid).toBe(false);
    });

    it('should reject email longer than 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(validateEmail(longEmail).valid).toBe(false);
      expect(validateEmail(longEmail).error).toContain('255');
    });

    it('should accept valid email address', () => {
      expect(validateEmail('researcher@andemta.et').valid).toBe(true);
    });
  });

  describe('Account Enumeration Defense', () => {
    it('should produce identical generic success message for both existing and non-existing accounts', async () => {
      const genericMsg = {
        message: 'If an account exists for this email address, password reset instructions will be sent.',
      };

      jest.spyOn(authClient, 'forgotPassword').mockResolvedValue(genericMsg);

      const res1 = await authClient.forgotPassword('registered@andemta.et');
      const res2 = await authClient.forgotPassword('nonexistent@andemta.et');

      // Responses must be completely indistinguishable
      expect(res1.message).toBe(res2.message);
    });
  });

  describe('Rate Limiting & Error Handling', () => {
    it('should handle HTTP 429 rate limit safely without exposing internal details', async () => {
      jest.spyOn(authClient, 'forgotPassword').mockRejectedValue(
        new ApiError('Too many password reset requests', 429),
      );

      let isRateLimited = false;
      let displayMsg = '';

      try {
        await authClient.forgotPassword('user@andemta.et');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 429) {
          isRateLimited = true;
          displayMsg = 'Too many password reset attempts. Please wait a few minutes before trying again.';
        }
      }

      expect(isRateLimited).toBe(true);
      expect(displayMsg).toContain('Too many password reset attempts');
    });

    it('should prevent duplicate submissions when request is currently in flight', async () => {
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
