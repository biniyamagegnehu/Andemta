import * as crypto from 'crypto';

/**
 * Generates at least 32 cryptographically secure random bytes encoded as base64url.
 * High entropy (256 bits) prevents enumeration or predictability.
 *
 * @param byteLength Number of random bytes (default: 32)
 * @returns Base64URL-encoded raw token
 */
export function generateRawToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a SHA-256 hash of a raw token for secure database persistence.
 * Raw tokens are never stored, logged, or exposed.
 *
 * @param rawToken The plaintext token string
 * @returns 64-character lowercase hexadecimal SHA-256 hash
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Converts a duration string (e.g. '15m', '1h', '2d', '900s', '900') or numeric seconds into seconds.
 * Defaults to 900 seconds (15 minutes) if unparseable.
 *
 * @param duration Duration value from configuration
 * @returns Numeric duration in seconds
 */
export function parseDurationToSeconds(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration > 0 ? duration : 900;
  }

  if (!duration || typeof duration !== 'string') {
    return 900;
  }

  const trimmed = duration.trim();
  const match = trimmed.match(/^(\d+)([smhd])?$/i);

  if (!match) {
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) || parsed <= 0 ? 900 : parsed;
  }

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return value;
  }
}
