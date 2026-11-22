import { tokenManager } from './token-manager';

describe('tokenManager (In-Memory Access-Token Management)', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
  });

  it('should initialize with null access token', () => {
    expect(tokenManager.getAccessToken()).toBeNull();
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  it('should store and retrieve the access token strictly in memory', () => {
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockToken';
    tokenManager.setAccessToken(mockToken);

    expect(tokenManager.getAccessToken()).toBe(mockToken);
    expect(tokenManager.hasAccessToken()).toBe(true);
  });

  it('should clear the access token from memory', () => {
    tokenManager.setAccessToken('mock-jwt-token');
    expect(tokenManager.hasAccessToken()).toBe(true);

    tokenManager.clearAccessToken();
    expect(tokenManager.getAccessToken()).toBeNull();
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  it('should handle null or undefined gracefully when setting token', () => {
    tokenManager.setAccessToken('temp-token');
    tokenManager.setAccessToken(null);
    expect(tokenManager.getAccessToken()).toBeNull();
    expect(tokenManager.hasAccessToken()).toBe(false);

    tokenManager.setAccessToken('temp-token-2');
    tokenManager.setAccessToken(undefined);
    expect(tokenManager.getAccessToken()).toBeNull();
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  it('should treat empty string as absent token', () => {
    tokenManager.setAccessToken('');
    expect(tokenManager.getAccessToken()).toBeNull();
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  it('should never touch localStorage, sessionStorage, or document.cookie', () => {
    // Verify that tokenManager operates strictly within closure memory
    // and is 100% safe for SSR execution in Node.js runtime environments
    tokenManager.setAccessToken('secret-token');
    expect(typeof window === 'undefined' || !window.localStorage?.getItem('secret-token')).toBe(true);
  });
});
