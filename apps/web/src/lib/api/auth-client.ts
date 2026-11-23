import { apiClient, getApiBaseUrl } from './api-client';
import { tokenManager } from './token-manager';
import {
  ApiError,
  type AuthUser,
  type ForgotPasswordDto,
  type LoginDto,
  type LoginResponseData,
  type RegisterDto,
  type RegisterResponseData,
  type RequestOptions,
  type ResendVerificationResponseData,
  type ResetPasswordDto,
  type VerifyEmailResponseData,
} from './types';

/**
 * Single-flight active refresh promise holder.
 * When multiple requests fail with 401 concurrently, exactly one refresh request is dispatched.
 * All other concurrent callers wait on this shared promise.
 */
let activeRefreshPromise: Promise<LoginResponseData | null> | null = null;

/**
 * Executes token refresh using the HttpOnly refresh token cookie.
 * Guarantees single-flight deduplication across the entire frontend runtime.
 * Never manipulates or reads the refresh token cookie in JavaScript.
 */
export async function refreshAccessToken(): Promise<LoginResponseData | null> {
  // If a refresh is already in progress, join the existing flight
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      // POST /auth/refresh expects the HttpOnly cookie 'andemta_refresh' sent via credentials: 'include'.
      // skipAuth and skipRefreshRetry prevent re-triggering the refresh interceptor.
      const responseData = await apiClient.post<LoginResponseData>(
        '/auth/refresh',
        {},
        {
          skipAuth: true,
          skipRefreshRetry: true,
        },
      );

      if (responseData && responseData.accessToken) {
        tokenManager.setAccessToken(responseData.accessToken);
        return responseData;
      }

      tokenManager.clearAccessToken();
      return null;
    } catch (err: unknown) {
      // Refresh token is expired, invalid, revoked, or reused.
      tokenManager.clearAccessToken();
      throw err;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Executes an authenticated API request using the current in-memory access token.
 * If the request fails with HTTP 401 Unauthorized, it attempts a single token refresh
 * and retries the original request once with the new access token.
 */
export async function authenticatedRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // If caller explicitly requested to skip authentication, bypass token attachment
  if (options.skipAuth) {
    return apiClient.request<T>(path, options);
  }

  // Attach in-memory access token if present
  const currentToken = tokenManager.getAccessToken();
  const headers = {
    ...((options.headers as Record<string, string>) || {}),
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
  };

  try {
    return await apiClient.request<T>(path, { ...options, headers });
  } catch (error: unknown) {
    // If the error is not a 401 or refresh retry was explicitly skipped or path is /auth/refresh, rethrow immediately
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      options.skipRefreshRetry ||
      path.includes('/auth/refresh')
    ) {
      throw error;
    }

    // Attempt single-flight session refresh
    let refreshedSession: LoginResponseData | null = null;
    try {
      refreshedSession = await refreshAccessToken();
    } catch (refreshErr) {
      // Refresh failed (cookie expired, invalid, or revoked)
      tokenManager.clearAccessToken();
      throw refreshErr;
    }

    if (!refreshedSession?.accessToken) {
      tokenManager.clearAccessToken();
      throw error;
    }

    // Retry the original request ONCE with the new access token
    const retryHeaders = {
      ...((options.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${refreshedSession.accessToken}`,
    };

    return await apiClient.request<T>(path, {
      ...options,
      headers: retryHeaders,
      skipRefreshRetry: true, // Prevent recursive refresh loops
    });
  }
}

/**
 * Centralized authentication API client facade.
 */
export const authClient = {
  /**
   * Authenticates user credentials with email and password via POST /api/v1/auth/login.
   * On success, stores the JWT access token in memory (tokenManager).
   * Backend delivers refresh token in an HttpOnly cookie.
   */
  async login(dto: LoginDto): Promise<LoginResponseData> {
    const data = await apiClient.post<LoginResponseData>('/auth/login', dto, {
      skipAuth: true,
      skipRefreshRetry: true,
    });

    if (data?.accessToken) {
      tokenManager.setAccessToken(data.accessToken);
    }

    return data;
  },

  /**
   * Returns the backend URL to initiate the Google OAuth 2.0 flow.
   * Directs the browser to GET /api/v1/auth/google.
   */
  getGoogleAuthUrl(): string {
    return `${getApiBaseUrl()}/auth/google`;
  },

  /**
   * Executes session refresh via HttpOnly refresh cookie.
   */
  refreshSession(): Promise<LoginResponseData | null> {
    return refreshAccessToken();
  },

  /**
   * Registers a new user account with email and password.
   * Does not store an access token or log the user in automatically.
   */
  register(dto: RegisterDto): Promise<RegisterResponseData> {
    return apiClient.post<RegisterResponseData>('/auth/register', dto, {
      skipAuth: true,
      skipRefreshRetry: true,
    });
  },

  /**
   * Consumes an email verification token to verify the user account.
   */
  verifyEmail(token: string): Promise<VerifyEmailResponseData> {
    return apiClient.post<VerifyEmailResponseData>(
      '/auth/verify-email',
      { token },
      {
        skipAuth: true,
        skipRefreshRetry: true,
      },
    );
  },

  /**
   * Requests a new email verification token.
   * Always returns generic response behavior to avoid account enumeration.
   */
  resendVerification(email: string): Promise<ResendVerificationResponseData> {
    return apiClient.post<ResendVerificationResponseData>(
      '/auth/resend-verification',
      { email },
      {
        skipAuth: true,
        skipRefreshRetry: true,
      },
    );
  },

  /**
   * Requests password reset instructions via POST /api/v1/auth/forgot-password.
   * Dispatches a reset email if the account exists, returning a generic message to prevent enumeration.
   */
  forgotPassword(
    emailOrDto: string | ForgotPasswordDto,
  ): Promise<Record<string, unknown>> {
    const email = typeof emailOrDto === 'string' ? emailOrDto : emailOrDto.email;
    return apiClient.post<Record<string, unknown>>(
      '/auth/forgot-password',
      { email },
      {
        skipAuth: true,
        skipRefreshRetry: true,
      },
    );
  },

  /**
   * Completes the password recovery workflow via POST /api/v1/auth/reset-password.
   * Consumes the one-time token, updates password, and revokes active sessions.
   * Clears any local in-memory access token.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<Record<string, unknown>> {
    try {
      return await apiClient.post<Record<string, unknown>>(
        '/auth/reset-password',
        dto,
        {
          skipAuth: true,
          skipRefreshRetry: true,
        },
      );
    } finally {
      tokenManager.clearAccessToken();
    }
  },

  /**
   * Retrieves the currently authenticated user's profile from GET /api/v1/auth/me.
   */
  getCurrentUser(): Promise<AuthUser> {
    return authenticatedRequest<AuthUser>('/auth/me');
  },

  /**
   * Logs out the user by calling the backend POST /api/v1/auth/logout endpoint
   * and clearing the in-memory access token.
   * Clears in-memory state even if the network or backend request fails.
   */
  async logout(): Promise<void> {
    try {
      await authenticatedRequest<Record<string, unknown>>('/auth/logout', {
        method: 'POST',
        skipRefreshRetry: true,
      });
    } catch {
      // Silently proceed with local teardown if backend is unreachable
    } finally {
      tokenManager.clearAccessToken();
    }
  },

  // Authenticated HTTP verb helpers
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return authenticatedRequest<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return authenticatedRequest<T>(path, { ...options, method: 'POST', body });
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return authenticatedRequest<T>(path, { ...options, method: 'PUT', body });
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return authenticatedRequest<T>(path, { ...options, method: 'PATCH', body });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return authenticatedRequest<T>(path, { ...options, method: 'DELETE' });
  },
};
