import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  function toDto(plain: Record<string, unknown>): RegisterDto {
    return plainToInstance(RegisterDto, plain);
  }

  it('should pass validation with valid email and password', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
      password: 'StrongP@ssword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with passwords containing spaces and Unicode characters', async () => {
    const dto = toDto({
      email: 'abebe@andemta.et',
      password: 'ሰላም ዓለም Pass word 123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when email is missing', async () => {
    const dto = toDto({
      password: 'StrongP@ssword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when email is empty string', async () => {
    const dto = toDto({
      email: '',
      password: 'StrongP@ssword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when email is invalid format', async () => {
    const dto = toDto({
      email: 'not-an-email',
      password: 'StrongP@ssword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
    expect(emailError?.constraints?.isEmail).toBeDefined();
  });

  it('should fail validation when email exceeds 255 characters', async () => {
    const longEmail = `${'a'.repeat(250)}@andemta.et`;
    const dto = toDto({
      email: longEmail,
      password: 'StrongP@ssword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints?.maxLength).toBeDefined();
  });

  it('should fail validation when password is missing', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError).toBeDefined();
  });

  it('should fail validation when password is empty string', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
      password: '',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError).toBeDefined();
  });

  it('should fail validation when password is shorter than 12 characters', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
      password: 'Short123!', // 9 characters
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError?.constraints?.minLength).toBeDefined();
  });

  it('should fail validation when password exceeds 128 characters', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
      password: 'P'.repeat(129),
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError?.constraints?.maxLength).toBeDefined();
  });

  it('should normalize email by trimming whitespace and converting to lowercase', async () => {
    const dto = toDto({
      email: '  User.Test@Andemta.ET  ',
      password: 'StrongP@ssword123!',
    });

    expect(dto.email).toBe('user.test@andemta.et');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

