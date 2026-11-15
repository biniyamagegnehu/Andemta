import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  function toDto(plain: Record<string, unknown>): LoginDto {
    return plainToInstance(LoginDto, plain);
  }

  it('should pass validation with valid email and password', async () => {
    const dto = toDto({
      email: 'researcher@andemta.et',
      password: 'ValidPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.email).toBe('researcher@andemta.et');
    expect(dto.password).toBe('ValidPassword123!');
  });

  it('should normalize email by trimming whitespace and converting to lowercase', async () => {
    const dto = toDto({
      email: '  Researcher.ANDEMTA@Example.ET  ',
      password: 'ValidPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.email).toBe('researcher.andemta@example.et');
  });

  it('should preserve password exactly as provided without trimming or altering spaces', async () => {
    const passwordWithSpaces = '  Exact Password With Spaces 123!  ';
    const dto = toDto({
      email: 'user@andemta.et',
      password: passwordWithSpaces,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.password).toBe(passwordWithSpaces);
  });

  it('should preserve Unicode passwords without transformation', async () => {
    const unicodePassword = 'ሰላም ዓለም Pass word 123!';
    const dto = toDto({
      email: 'user@andemta.et',
      password: unicodePassword,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.password).toBe(unicodePassword);
  });

  it('should fail validation when email is missing', async () => {
    const dto = toDto({
      password: 'ValidPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when email is invalid format', async () => {
    const dto = toDto({
      email: 'not-an-email',
      password: 'ValidPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when email exceeds 255 characters', async () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    const dto = toDto({
      email: longEmail,
      password: 'ValidPassword123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('should fail validation when password is empty', async () => {
    const dto = toDto({
      email: 'user@andemta.et',
      password: '',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError).toBeDefined();
  });

  it('should fail validation when password exceeds 128 characters', async () => {
    const longPassword = 'P'.repeat(129);
    const dto = toDto({
      email: 'user@andemta.et',
      password: longPassword,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError).toBeDefined();
  });
});
