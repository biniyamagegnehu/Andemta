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
