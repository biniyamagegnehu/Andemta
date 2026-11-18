import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ResetPasswordDto } from './reset-password.dto';

describe('ResetPasswordDto', () => {
  function toDto(plain: Record<string, unknown>): ResetPasswordDto {
    return plainToInstance(ResetPasswordDto, plain);
  }

  it('should pass validation with valid token and password', async () => {
    const dto = toDto({
      token: 'valid-raw-reset-token-sample',
      newPassword: 'StrongPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should preserve spaces and Unicode in newPassword without trimming', async () => {
    const rawPass = '  መለያ ቁጥር Pass 123!  ';
    const dto = toDto({
      token: 'valid-raw-reset-token-sample',
      newPassword: rawPass,
    });

    expect(dto.newPassword).toBe(rawPass);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when token is missing or empty', async () => {
    const dto = toDto({
      newPassword: 'StrongPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError).toBeDefined();

    const emptyDto = toDto({
      token: '',
      newPassword: 'StrongPassword123!',
    });
    const emptyErrors = await validate(emptyDto);
    expect(emptyErrors.length).toBeGreaterThan(0);
  });

  it('should fail validation when newPassword is less than 12 characters', async () => {
    const dto = toDto({
      token: 'valid-raw-token',
      newPassword: 'short',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passError = errors.find((e) => e.property === 'newPassword');
    expect(passError?.constraints?.minLength).toBeDefined();
  });

  it('should fail validation when newPassword exceeds 128 characters', async () => {
    const dto = toDto({
      token: 'valid-raw-token',
      newPassword: 'a'.repeat(129),
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passError = errors.find((e) => e.property === 'newPassword');
    expect(passError?.constraints?.maxLength).toBeDefined();
  });
});
