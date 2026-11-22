import { ApiError, type ApiErrorResponse, type ApiResponse, type RequestOptions } from './types';

/**
 * Returns the centralized API base URL from environment variables, defaulting to local dev backend.
 * Strips any trailing slashes to ensure consistent path concatenation.
 */
export function getApiBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000/api/v1';

  return envUrl.replace(/\/+$/, '');
}

/**
 * Builds a full target URL by concatenating the base URL with the endpoint path
 * and serializing query parameters safely.
 */
export function buildApiUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Low-level typed API client that communicates with the NestJS backend.
 * Unwraps standardized response envelopes ({ success: true, message, data, meta })
 * and translates error envelopes ({ success: false, message, errors }) into typed ApiError instances.
 */
export class ApiClient {
  /**
   * Executes a fetch request with standard error handling, JSON serialization, and credentials.
   */
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, body, headers: customHeaders, ...restOptions } = options;
    delete (restOptions as { skipAuth?: boolean }).skipAuth;
    delete (restOptions as { skipRefreshRetry?: boolean }).skipRefreshRetry;

    const url = buildApiUrl(path, params);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((customHeaders as Record<string, string>) || {}),
    };

    let serializedBody: BodyInit | undefined;
    if (body !== undefined && body !== null) {
      if (
        typeof body === 'string' ||
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof ArrayBuffer ||
        body instanceof URLSearchParams
      ) {
        serializedBody = body as BodyInit;
      } else {
        headers['Content-Type'] = 'application/json';
        serializedBody = JSON.stringify(body);
      }
    }

    const fetchConfig: RequestInit = {
      credentials: 'include', // Always send HttpOnly cookies for session/CSRF validation
      ...restOptions,
      headers,
      body: serializedBody,
    };

    let res: Response;
    try {
      res = await fetch(url, fetchConfig);
    } catch (networkErr: unknown) {
      const errMessage =
        networkErr instanceof Error
          ? networkErr.message
          : 'Network connection failed. Please verify that the API server is reachable.';
      throw new ApiError(errMessage, 0, [], true);
    }

    return this.handleResponse<T>(res);
  }

  /**
   * Parses the HTTP response and resolves the inner payload or throws a typed ApiError.
   */
  private async handleResponse<T>(res: Response): Promise<T> {
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ApiError(
          text || `HTTP ${res.status}: ${res.statusText || 'Unexpected error'}`,
          res.status,
        );
      }
      // Non-JSON successful response (e.g., 204 No Content)
      return null as T;
    }

    let jsonPayload: unknown;
    try {
      jsonPayload = await res.json();
    } catch {
      if (!res.ok) {
        throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status);
      }
      return null as T;
    }

    if (res.ok) {
      // Backend returns standard envelope: { success: true, message, data, meta }
      if (
        jsonPayload &&
        typeof jsonPayload === 'object' &&
        'success' in jsonPayload &&
        (jsonPayload as ApiResponse<T>).success === true &&
        'data' in jsonPayload
      ) {
        return (jsonPayload as ApiResponse<T>).data;
      }
      // Fallback if endpoint returns direct payload
      return jsonPayload as T;
    }

    // Backend error envelope: { success: false, message, errors: [...] }
    if (
      jsonPayload &&
      typeof jsonPayload === 'object' &&
      'success' in jsonPayload &&
      (jsonPayload as ApiErrorResponse).success === false
    ) {
      const errorEnvelope = jsonPayload as ApiErrorResponse;
      throw new ApiError(
        errorEnvelope.message || `Request failed with status ${res.status}`,
        res.status,
        Array.isArray(errorEnvelope.errors) ? errorEnvelope.errors : [],
      );
    }

    // Fallback error format (e.g. { statusCode, message })
    const genericMessage =
      jsonPayload &&
      typeof jsonPayload === 'object' &&
      'message' in jsonPayload &&
      typeof (jsonPayload as { message: unknown }).message === 'string'
        ? (jsonPayload as { message: string }).message
        : `Request failed with status ${res.status}`;

    throw new ApiError(genericMessage, res.status);
  }

  // Convenience HTTP methods
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
