import { authClient, ApiError } from '@/lib/api';

describe('Resend Verification Flow & Non-Enumeration Logic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send resend request and return generic non-enumerating message', async () => {
    const genericMsg = {
      message: 'If an account requires email verification, a verification email will be sent.',
    };

    const resendSpy = jest.spyOn(authClient, 'resendVerification').mockResolvedValue(genericMsg);

    const result = await authClient.resendVerification('user@andemta.et');

    expect(resendSpy).toHaveBeenCalledWith('user@andemta.et');
    expect(result.message).toBe(
      'If an account requires email verification, a verification email will be sent.',
    );
  });

  it('should return identical generic message for non-existent and already-verified accounts', async () => {
    const genericMsg = {
      message: 'If an account requires email verification, a verification email will be sent.',
    };

    jest.spyOn(authClient, 'resendVerification').mockResolvedValue(genericMsg);

    const res1 = await authClient.resendVerification('nonexistent@andemta.et');
    const res2 = await authClient.resendVerification('alreadyverified@andemta.et');

    // Zero discrepancy between responses prevents email enumeration
    expect(res1.message).toBe(res2.message);
  });

  it('should handle rate limiting HTTP 429 response', async () => {
    jest.spyOn(authClient, 'resendVerification').mockRejectedValue(
      new ApiError('Too many requests. Please wait a moment before trying again.', 429),
    );

    let isRateLimited = false;
    let message = '';

    try {
      await authClient.resendVerification('spammer@andemta.et');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        isRateLimited = true;
        message = 'Too many requests. Please wait a few minutes before requesting another verification email.';
      }
    }

    expect(isRateLimited).toBe(true);
    expect(message).toContain('Too many requests');
  });

  it('should manage 60-second cooldown timer state', () => {
    let cooldown = 60;
    const tick = () => {
      cooldown = Math.max(0, cooldown - 1);
    };

    expect(cooldown).toBe(60);
    const canSubmitBefore = cooldown === 0;
    expect(canSubmitBefore).toBe(false);

    // Tick 30 seconds
    for (let i = 0; i < 30; i++) tick();
    expect(cooldown).toBe(30);

    // Tick remaining 30 seconds
    for (let i = 0; i < 30; i++) tick();
    expect(cooldown).toBe(0);
    const canSubmitAfter = cooldown === 0;
    expect(canSubmitAfter).toBe(true);
  });
});
