import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const COMMON_PASSWORDS = new Set([
  'password1234',
  '123456789012',
  '1234567890123',
  'qwertyuiop12',
  'administrator',
  'welcome12345',
  'letmein12345',
  'andemta12345',
  'iloveyou1234',
  'monkey123456',
  'dragon123456',
  'football1234',
  'baseball1234',
  'trustnoone12',
  'superman1234',
  'master123456',
]);

/**
 * Checks whether a candidate password is on the common blacklist
 * or consists of trivial repetitions/sequences.
 */
export function isCommonPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  const lower = password.toLowerCase();

  // 1. Exact match against known common 12+ character passwords
  if (COMMON_PASSWORDS.has(lower)) {
    return true;
  }

  // 2. Check repeated single character (e.g. 'aaaaaaaaaaaa')
  if (/^(.)\1+$/.test(password)) {
    return true;
  }

  // 3. Check simple sequential patterns
  const sequences = ['0123456789012', 'abcdefghijkl', 'qwertyuiopas'];
  for (const seq of sequences) {
    if (seq.includes(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Custom class-validator decorator enforcing that passwords are not common or trivially guessable.
 */
export function IsNotCommonPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotCommonPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          return !isCommonPassword(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return 'password is too common or easily guessable. Please choose a more unique password.';
        },
      },
    });
  };
}
