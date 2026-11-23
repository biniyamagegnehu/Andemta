/**
 * Sanitizes candidate redirect URLs to prevent open redirect vulnerabilities.
 * Only internal relative paths beginning with a single '/' are permitted.
 * Double-slash ('//'), protocol specifications ('://'), backslash prefixes, and control characters are rejected.
 *
 * @param candidate Candidate URL or path string from query parameter
 * @param defaultPath Fallback path when candidate is invalid or empty (defaults to '/')
 * @returns Safe relative path string
 */
export function getSafeRedirectUrl(
  candidate?: string | null,
  defaultPath = '/',
): string {
  if (!candidate || typeof candidate !== 'string') {
    return defaultPath;
  }

  const trimmed = candidate.trim();

  // Validate internal relative path: starts with single '/', no protocol, no double-slash, no backslashes
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://') &&
    !/[\r\n]/.test(trimmed)
  ) {
    return trimmed;
  }

  return defaultPath;
}
