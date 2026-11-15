import { parseDurationToSeconds } from './token.utils';

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
