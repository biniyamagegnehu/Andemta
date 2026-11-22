/**
 * In-memory access-token manager.
 *
 * Requirements:
 * - Stores the current JWT access token strictly in JavaScript memory (module closure).
 * - Never persists the token to localStorage, sessionStorage, cookies, or IndexedDB.
 * - Safe for Server-Side Rendering (SSR) in Next.js without causing window or hydration errors.
 * - Does not log raw token strings to prevent secret leakage in monitoring.
 */

let inMemoryAccessToken: string | null = null;

export const tokenManager = {
  /**
   * Returns the current access token stored in JavaScript memory, or null if none exists.
   */
  getAccessToken(): string | null {
    return inMemoryAccessToken;
  },

  /**
   * Sets or clears the in-memory access token.
   *
   * @param token - A valid JWT access token string, or null/undefined to clear.
   */
  setAccessToken(token: string | null | undefined): void {
    inMemoryAccessToken = token || null;
  },

  /**
   * Clears the current in-memory access token.
   */
  clearAccessToken(): void {
    inMemoryAccessToken = null;
  },

  /**
   * Checks whether an access token is currently present in memory.
   */
  hasAccessToken(): boolean {
    return inMemoryAccessToken !== null && inMemoryAccessToken.length > 0;
  },
};
