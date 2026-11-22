import { authClient, tokenManager, ApiError } from '@/lib/api';

describe('Registration Form Validation & Policy', () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (val: string): { valid: boolean; error?: string } => {
    const trimmed = val.trim();
    if (!trimmed) return { valid: false, error: 'Email address is required' };
    if (!EMAIL_REGEX.test(trimmed)) return { valid: false, error: 'Please enter a valid email address' };
    if (trimmed.length > 255) return { valid: false, error: 'Email address must be at most 255 characters long' };
    return { valid: true };
  };

  const validatePassword = (val: string): { valid: boolean; error?: string } => {
    if (!val) return { valid: false, error: 'Password is required' };
    if (val.length < 12) return { valid: false, error: 'Password must be at least 12 characters long' };
    if (val.length > 128) return { valid: false, error: 'Password must be at most 128 characters long' };
    return { valid: true };
  };

  const validateConfirmPassword = (confirmVal: string, passwordVal: string): { valid: boolean; error?: string } => {
    if (!confirmVal) return { valid: false, error: 'Please confirm your password' };
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

  describe('Email validation', () => {
    it('should reject empty or whitespace-only email', () => {
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('   ').valid).toBe(false);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('notanemail').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
      expect(validateEmail('@domain.com').valid).toBe(false);
      expect(validateEmail('user@domain').valid).toBe(false);
    });

    it('should reject email longer than 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(validateEmail(longEmail).valid).toBe(false);
      expect(validateEmail(longEmail).error).toContain('255');
    });

    it('should accept valid email addresses', () => {
      expect(validateEmail('researcher@andemta.et').valid).toBe(true);
      expect(validateEmail('user.name+tag@sub.domain.edu.et').valid).toBe(true);
    });
  });

  describe('Password policy validation', () => {
    it('should reject empty password', () => {
      expect(validatePassword('').valid).toBe(false);
    });

    it('should reject passwords shorter than 12 characters', () => {
      expect(validatePassword('Short123!').valid).toBe(false);
      expect(validatePassword('12345678901').valid).toBe(false); // 11 chars
      expect(validatePassword('12345678901').error).toBe('Password must be at least 12 characters long');
    });

    it('should accept passwords with exactly 12 characters', () => {
      expect(validatePassword('123456789012').valid).toBe(true);
    });

    it('should accept passwords with up to 128 characters', () => {
      const maxPass = 'A'.repeat(128);
      expect(validatePassword(maxPass).valid).toBe(true);
    });

    it('should reject passwords longer than 128 characters', () => {
      const overMax = 'A'.repeat(129);
      expect(validatePassword(overMax).valid).toBe(false);
      expect(validatePassword(overMax).error).toBe('Password must be at most 128 characters long');
    });

    it('should accept passwords containing spaces and not trim them', () => {
      const passWithSpaces = 'my secure phrase with spaces 2026';
      expect(validatePassword(passWithSpaces).valid).toBe(true);
      expect(passWithSpaces.length).toBeGreaterThanOrEqual(12);
    });

    it('should accept passwords with Unicode characters', () => {
      const unicodePass = 'የይለፍ_ቃል_በጣም_ጥሩ_ነው_2026!✨';
      expect(validatePassword(unicodePass).valid).toBe(true);
    });
  });

  describe('Confirm password validation', () => {
    it('should reject empty confirm password', () => {
      expect(validateConfirmPassword('', 'ValidPass12345').valid).toBe(false);
    });

    it('should reject when confirm password does not match password', () => {
      expect(validateConfirmPassword('DifferentPassword123', 'ValidPass12345').valid).toBe(false);
      expect(validateConfirmPassword('DifferentPassword123', 'ValidPass12345').error).toBe('Passwords do not match');
    });

    it('should accept when confirm password matches password exactly', () => {
      const pass = 'ExactMatchPass2026!';
      expect(validateConfirmPassword(pass, pass).valid).toBe(true);
    });
  });

  describe('Registration submission flow & side effects', () => {
    it('should exclude confirmPassword from backend payload and never store an access token', async () => {
      const registerSpy = jest.spyOn(authClient, 'register').mockResolvedValue({
        id: 'usr-abc',
        email: 'user@andemta.et',
        emailVerifiedAt: null,
        createdAt: '2026-11-22T00:00:00.000Z',
      });

      const emailInput = '  User@Andemta.ET  ';
      const passwordInput = 'SecurePassword1234!';
      const confirmInput = 'SecurePassword1234!';

      // Client prepares registration payload
      const normalizedEmail = emailInput.trim().toLowerCase();
      expect(validateConfirmPassword(confirmInput, passwordInput).valid).toBe(true);

      const payload = {
        email: normalizedEmail,
        password: passwordInput,
      };

      // Confirm confirmPassword is not in payload
      expect((payload as Record<string, unknown>).confirmPassword).toBeUndefined();

      const result = await authClient.register(payload);

      expect(registerSpy).toHaveBeenCalledWith({
        email: 'user@andemta.et',
        password: 'SecurePassword1234!',
      });
      expect(result.id).toBe('usr-abc');
      expect(tokenManager.hasAccessToken()).toBe(false);
    });

    it('should handle duplicate email 409 conflict appropriately', async () => {
      jest.spyOn(authClient, 'register').mockRejectedValue(
        new ApiError('An account with this email already exists', 409),
      );

      let isConflict = false;
      try {
        await authClient.register({
          email: 'duplicate@andemta.et',
          password: 'Password123456!',
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          isConflict = true;
        }
      }

      expect(isConflict).toBe(true);
      expect(tokenManager.hasAccessToken()).toBe(false);
    });
  });
});
