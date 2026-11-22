# Frontend Authentication Architecture (Phase 3.10)

## 1. Overview & Security Foundation

Phase 3.10 establishes the frontend authentication infrastructure for **Andemta** (`apps/web`). It connects the Next.js 15 App Router frontend with the hardened NestJS backend API (`/api/v1`), upholding zero-trust client security principles:

1. **In-Memory JWT Access Tokens**:
   - Access tokens are stored strictly in JavaScript runtime memory via closure encapsulation (`tokenManager`).
   - Access tokens are **never** persisted to `localStorage`, `sessionStorage`, `document.cookie`, or `IndexedDB`.
   - Protects against persistent token extraction via Cross-Site Scripting (XSS).
   - SSR-safe: executes cleanly in both server-side Node.js and browser environments without hydration errors.

2. **HttpOnly Refresh Tokens**:
   - Session continuity relies on opaque refresh tokens stored exclusively in secure, `HttpOnly`, `SameSite=Lax` cookies managed by the backend.
   - The frontend JavaScript runtime **never** reads, inspects, or manually sets the refresh cookie.
   - All token refresh operations and logout requests explicitly set `credentials: 'include'` to pass the cookie securely.

3. **Single-Flight Refresh Deduplication**:
   - Protects backend session families from race conditions and false-positive reuse detection.
   - Concurrent 401 Unauthorized API responses share a single pending `refreshAccessToken()` promise.
   - Upon resolution, waiting requests are retried once with the new access token.

---

## 2. Architecture & Component Blueprint

```
apps/web/src/
├── lib/
│   └── api/
│       ├── types.ts          # Standard response/error envelopes & AuthUser contracts
│       ├── token-manager.ts  # In-memory access token closure (SSR-safe)
│       ├── api-client.ts     # Base typed HTTP client (fetch, envelope parsing, ApiError)
│       ├── auth-client.ts    # Single-flight refresh, authenticated request wrapper, logout
│       └── index.ts          # Unified public export barrel
├── context/
│   ├── auth-context.tsx      # AuthContext, AuthProvider, initialization lifecycle
│   └── use-auth.ts           # useAuth() consumer hook
└── components/
    └── auth-provider.tsx     # ClientAuthProvider wrapper for Next.js App Router RootLayout
```

---

## 3. Core Modules & Contracts

### 3.1 Token Manager (`token-manager.ts`)

Encapsulates the in-memory access token state:
- `getAccessToken(): string | null`
- `setAccessToken(token: string | null | undefined): void`
- `clearAccessToken(): void`
- `hasAccessToken(): boolean`

Tokens are never logged to console or exposed to global window objects.

### 3.2 Typed API Client (`api-client.ts`)

- Centralizes base URL configuration (`process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'`).
- Enforces `credentials: 'include'` across all requests.
- Unwraps backend standardized envelopes:
  - **Success Envelope**: `{ success: true, message: string, data: T, meta: ApiPaginationMeta | null }` $\rightarrow$ resolves `data: T`.
  - **Error Envelope**: `{ success: false, message: string, data: null, errors: ApiErrorDetail[] }` $\rightarrow$ throws `ApiError` with HTTP status, message, and field errors.
  - **Network Failures**: Catches network exceptions and normalizes to `ApiError` with `isNetworkError: true` and status `0`.

### 3.3 Auth Client & Single-Flight Concurrency (`auth-client.ts`)

- **Refresh Endpoint**: `POST /api/v1/auth/refresh`
- **Current User Endpoint**: `GET /api/v1/auth/me`
- **Logout Endpoint**: `POST /api/v1/auth/logout`

#### Single-Flight Concurrency Flow:

```
Parallel Requests Receive 401
          │
          ├────────────────────────┐
          ▼                        ▼
Request A (Fails 401)    Request B (Fails 401)
          │                        │
  activeRefreshPromise == null?     │
          │ Yes                    │ No (Join flight)
  activeRefreshPromise = fetch()   │
          │                        │
          └───────────┬────────────┘
                      ▼
            POST /auth/refresh
                      │
            Success: setAccessToken(new)
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
Retry Request A (Once)   Retry Request B (Once)
```

- If refresh fails (e.g. revoked, expired, or session family reuse detected), `tokenManager.clearAccessToken()` is invoked, and all waiting requests fail with the refresh error.
- Infinite loops are prevented by setting `skipRefreshRetry: true` on retry attempts and bypassing retries for `/auth/refresh`.

### 3.4 React Authentication Context (`auth-context.tsx` & `use-auth.ts`)

Provides centralized authentication state:
- `user: AuthUser | null`: Safe user profile (`id`, `email`, `emailVerifiedAt`).
- `isAuthenticated: boolean`: Computed as `!!user`.
- `isLoading: boolean`: Indicates initialization or authentication state transition.
- `isInitialized: boolean`: Guarantees the application boot check completed without hanging.
- `loginState(data)`: Updates in-memory token and user upon future login.
- `logout()`: Dispatches backend session revocation and clears local memory.
- `refreshSession()`: Manually triggers session restoration.

#### Initialization Lifecycle:
1. Application mounts with `isLoading = true`, `isInitialized = false`.
2. React 18/19 StrictMode remount duplicate execution is prevented via `initStartedRef`.
3. Background call to `authClient.refreshSession()` attempts session restoration using HttpOnly cookie.
4. If valid, user state is populated. If invalid or cookie absent, user remains `null`.
5. `isLoading` transitions to `false` and `isInitialized` transitions to `true`.
6. No automatic redirects or routing side-effects are performed.

---

## 4. Verification & Testing Summary

Unit test suites cover 100% of the frontend authentication foundation:
- `token-manager.spec.ts`: In-memory isolation, clearing, and SSR safety.
- `api-client.spec.ts`: Query serialization, envelope unwrapping, error mapping, network failure handling, credentials transmission.
- `auth-client.spec.ts`: Single-flight refresh deduplication, concurrent flight sharing, 401 interceptor retry, logout teardown.
- `auth-context.spec.ts`: Session restoration lifecycle and state updates.

---

## 5. Scope Boundaries

Per the Phase 3.10 specification:
- **No UI screens** (Login, Register, Forgot Password, Reset Password, or OAuth buttons) are implemented in this phase.
- **No route protection** (Middleware redirects or protected route guards) are implemented in this phase.
- All visual components and authentication workflows are reserved for Phase 3.11+.
