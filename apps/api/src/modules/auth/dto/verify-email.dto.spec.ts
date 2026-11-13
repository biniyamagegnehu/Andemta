import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VerifyEmailDto } from './verify-email.dto';

describe('VerifyEmailDto', () => {
  function toDto(plain: Record<string, unknown>): VerifyEmailDto {
    return plainToInstance(VerifyEmailDto, plain);
  }

  it('should pass validation with a valid non-empty token string', async () => {
    const dto = toDto({
      token: 'dGhpcy1pcy1hLXZhbGlkLWJhc2U2NHVybC10b2tlbg',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when token is missing', async () => {
    const dto = toDto({});

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError).toBeDefined();
  });

  it('should fail validation when token is an empty string', async () => {
    const dto = toDto({ token: '' });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError?.constraints?.isNotEmpty).toBeDefined();
  });

  it('should fail validation when token is not a string', async () => {
    const dto = toDto({ token: 12345 });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError?.constraints?.isString).toBeDefined();
  });

  it('should fail validation when token exceeds 255 characters', async () => {
    const dto = toDto({ token: 'a'.repeat(256) });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError?.constraints?.maxLength).toBeDefined();
  });
});

