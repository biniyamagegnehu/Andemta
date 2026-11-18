import {
  parseDurationToSeconds,
  generateRawToken,
  hashToken,
} from './token.utils';

describe('token.utils', () => {
  describe('generateRawToken', () => {
    it('should generate a base64url string of expected length', () => {
      const token = generateRawToken(32);
      expect(typeof token).toBe('string');
      // 32 bytes in base64url is 43 characters
      expect(token.length).toBe(43);
      // Valid base64url characters only (no +, /, or =)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique values on consecutive calls', () => {
      const token1 = generateRawToken(32);
      const token2 = generateRawToken(32);
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashToken', () => {
    it('should compute a 64-character lowercase hexadecimal SHA-256 hash', () => {
      const hash = hashToken('test-raw-token');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce identical hash for identical input', () => {
      const hash1 = hashToken('my-token');
      const hash2 = hashToken('my-token');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token-1');
      const hash2 = hashToken('token-2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('parseDurationToSeconds', () => {
  it('should parse minutes correctly', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('30m')).toBe(1800);
    expect(parseDurationToSeconds('1m')).toBe(60);
  });

  it('should parse seconds correctly', () => {
    expect(parseDurationToSeconds('900s')).toBe(900);
    expect(parseDurationToSeconds('60s')).toBe(60);
  });

  it('should parse hours correctly', () => {
    expect(parseDurationToSeconds('1h')).toBe(3600);
    expect(parseDurationToSeconds('24h')).toBe(86400);
  });

  it('should parse days correctly', () => {
    expect(parseDurationToSeconds('1d')).toBe(86400);
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('should handle raw numeric seconds string or number', () => {
    expect(parseDurationToSeconds('900')).toBe(900);
    expect(parseDurationToSeconds(900)).toBe(900);
  });

  it('should return default 900 for invalid or malformed strings', () => {
    expect(parseDurationToSeconds('')).toBe(900);
    expect(parseDurationToSeconds('invalid')).toBe(900);
    expect(parseDurationToSeconds(-10)).toBe(900);
  });
});
});
