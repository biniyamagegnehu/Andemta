import { isCommonPassword } from './is-not-common-password.validator';

describe('isCommonPassword Validator', () => {
  it('should identify common passwords from blacklist', () => {
    expect(isCommonPassword('password1234')).toBe(true);
    expect(isCommonPassword('123456789012')).toBe(true);
    expect(isCommonPassword('administrator')).toBe(true);
    expect(isCommonPassword('qwertyuiop12')).toBe(true);
  });

  it('should identify repeated single character passwords', () => {
    expect(isCommonPassword('aaaaaaaaaaaa')).toBe(true);
    expect(isCommonPassword('111111111111')).toBe(true);
  });

  it('should accept secure strong passwords', () => {
    expect(isCommonPassword('MySecureAndemtaPass2026!')).toBe(false);
    expect(isCommonPassword('ethi0pia-r3s3arch-mark3tplac3')).toBe(false);
    expect(isCommonPassword('አዲስ_አበባ_2026_Secure!')).toBe(false); // Unicode support
  });
});
