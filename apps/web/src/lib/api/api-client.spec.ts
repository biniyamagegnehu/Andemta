import { ApiClient, buildApiUrl, getApiBaseUrl } from './api-client';
import { ApiError } from './types';

describe('apiClient (Typed Base API Client)', () => {
  let client: ApiClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new ApiClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('URL building & parameter serialization', () => {
    it('should build target URL properly with base URL and normalized leading slash', () => {
      const url = buildApiUrl('auth/me');
      expect(url).toContain('/api/v1/auth/me');
    });

    it('should append query parameters correctly while discarding undefined/null values', () => {
      const url = buildApiUrl('/search', {
        q: 'ethiopia',
        page: 2,
        limit: 10,
        empty: undefined,
        blank: null,
      });

      expect(url).toContain('q=ethiopia');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
      expect(url).not.toContain('empty=');
      expect(url).not.toContain('blank=');
    });

    it('should trim trailing slashes from the API base URL', () => {
      const baseUrl = getApiBaseUrl();
      expect(baseUrl.endsWith('/')).toBe(false);
    });
  });

  describe('Request handling and response envelope unwrapping', () => {
    it('should automatically include credentials: include for cookies', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'OK',
          data: { ping: 'pong' },
          meta: null,
        }),
      });
      global.fetch = mockFetch;

      const result = await client.get<{ ping: string }>('/health');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.objectContaining({
          credentials: 'include',
          method: 'GET',
        }),
      );
      expect(result).toEqual({ ping: 'pong' });
    });

    it('should unwrap standardized backend response envelope { success: true, data }', async () => {
      const envelopeData = { id: 'usr-1', email: 'test@andemta.et' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'User retrieved successfully',
          data: envelopeData,
          meta: null,
        }),
      });

      const data = await client.get('/auth/me');
      expect(data).toEqual(envelopeData);
    });

    it('should serialize JSON body and attach Content-Type: application/json', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'Created',
          data: { id: '123' },
          meta: null,
        }),
      });
      global.fetch = mockFetch;

      const payload = { email: 'user@andemta.et', role: 'researcher' };
      await client.post('/users', payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        }),
      );
    });

    it('should parse backend error envelope and throw typed ApiError with field errors', async () => {
      const errorEnvelope = {
        success: false,
        message: 'Validation failed',
        data: null,
        errors: [{ field: 'email', message: 'Email must be valid' }],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => errorEnvelope,
      });

      await expect(client.post('/auth/register', {})).rejects.toThrow(ApiError);

      try {
        await client.post('/auth/register', {});
      } catch (err: unknown) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.message).toBe('Validation failed');
        expect(apiErr.errors).toEqual([
          { field: 'email', message: 'Email must be valid' },
        ]);
        expect(apiErr.isNetworkError).toBe(false);
      }
    });

    it('should wrap network connection failures in an ApiError with isNetworkError: true', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.get('/health')).rejects.toThrow(ApiError);

      try {
        await client.get('/health');
      } catch (err: unknown) {
        const apiErr = err as ApiError;
        expect(apiErr.isNetworkError).toBe(true);
        expect(apiErr.status).toBe(0);
      }
    });

    it('should support PUT, PATCH, and DELETE verbs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, message: 'Done', data: { ok: true }, meta: null }),
      });
      global.fetch = mockFetch;

      await client.put('/profile', { name: 'Abebe' });
      expect(mockFetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));

      await client.patch('/profile', { title: 'Lead' });
      expect(mockFetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH' }));

      await client.delete('/profile');
      expect(mockFetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ method: 'DELETE' }));
    });
  });
});
