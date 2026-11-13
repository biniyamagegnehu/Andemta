import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ResendVerificationDto } from './resend-verification.dto';

describe('ResendVerificationDto', () => {
  function toDto(plain: Record<string, unknown>): ResendVerificationDto {
    return plainToInstance(ResendVerificationDto, plain);
  }

  it('should pass validation with a valid email address and normalize casing and spaces', async () => {
    const dto = toDto({
      email: '  Researcher.User@Andemta.ET  ',
    });

    expect(dto.email).toBe('researcher.user@andemta.et');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when email is missing', async () => {
    const dto = toDto({});

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when email is empty string', async () => {
    const dto = toDto({ email: '' });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints?.isNotEmpty).toBeDefined();
  });

  it('should fail validation when email format is invalid', async () => {
    const dto = toDto({ email: 'not-an-email' });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints?.isEmail).toBeDefined();
  });

  it('should fail validation when email exceeds 255 characters', async () => {
    const longEmail = `${'a'.repeat(250)}@andemta.et`;
    const dto = toDto({ email: longEmail });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints?.maxLength).toBeDefined();
  });
});

