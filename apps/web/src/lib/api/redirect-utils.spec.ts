import { getSafeRedirectUrl } from './redirect-utils';

describe('getSafeRedirectUrl (Open Redirect Prevention)', () => {
  it('should return fallback path when candidate is undefined, null, or empty', () => {
    expect(getSafeRedirectUrl(undefined)).toBe('/');
    expect(getSafeRedirectUrl(null)).toBe('/');
    expect(getSafeRedirectUrl('')).toBe('/');
    expect(getSafeRedirectUrl('   ')).toBe('/');
    expect(getSafeRedirectUrl(undefined, '/dashboard')).toBe('/dashboard');
  });

  it('should accept valid internal relative paths', () => {
    expect(getSafeRedirectUrl('/surveys')).toBe('/surveys');
    expect(getSafeRedirectUrl('/profile/settings')).toBe('/profile/settings');
    expect(getSafeRedirectUrl('/studies?category=tech&page=2')).toBe('/studies?category=tech&page=2');
    expect(getSafeRedirectUrl('/research#overview')).toBe('/research#overview');
  });

  it('should reject external URLs with protocol schemes', () => {
    expect(getSafeRedirectUrl('https://evil-phishing.com')).toBe('/');
    expect(getSafeRedirectUrl('http://evil.com')).toBe('/');
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/');
    expect(getSafeRedirectUrl('data:text/html,evil')).toBe('/');
  });

  it('should reject protocol-relative URLs starting with double slash (//)', () => {
    expect(getSafeRedirectUrl('//evil.com')).toBe('/');
    expect(getSafeRedirectUrl('//evil.com/phishing')).toBe('/');
  });

  it('should reject backslash bypass attempts (/\\)', () => {
    expect(getSafeRedirectUrl('/\\evil.com')).toBe('/');
  });

  it('should reject URLs containing control characters or newlines', () => {
    expect(getSafeRedirectUrl('/path\nhttps://evil.com')).toBe('/');
    expect(getSafeRedirectUrl('/path\r\nevil')).toBe('/');
  });
});
