# Frontend Login & Google Authentication Architecture (Phase 3.12)

## 1. Overview

Phase 3.12 implements the user authentication experience for **Andemta** (`apps/web`), supporting both credential-based login (email/password) and Google OAuth 2.0 authentication.

### Core Security & Architectural Principles:
1. **In-Memory Access Tokens**:
   - Access tokens are stored strictly in JavaScript runtime memory via closure encapsulation (`tokenManager`).
   - Access tokens are **never** persisted to `localStorage`, `sessionStorage`, `document.cookie`, or `IndexedDB`.
2. **HttpOnly Refresh Cookies**:
   - The backend delivers and rotates opaque refresh tokens exclusively via secure `HttpOnly`, `SameSite=Lax` cookies (`andemta_refresh`).
   - The frontend JavaScript runtime never reads, writes, or inspects the refresh cookie.
3. **No OAuth Secret Exposure**:
   - Google Client Secret is never referenced or exposed in frontend code; PKCE state and token exchanges occur exclusively on the NestJS backend.
4. **Post-Login Open Redirect Defense**:
   - Return destinations are validated via `getSafeRedirectUrl()`, restricting redirects to internal relative paths and preventing open redirect vulnerabilities.
5. **Account Enumeration Defense**:
   - Failed credentials return generic messages ("Invalid email or password").
   - Unverified accounts trigger specific verification notices with a direct link to the resend verification flow.
6. **Strict Mode Concurrency Guard**:
   - OAuth callback processing utilizes `hasProcessedRef` to guarantee that single-use session restoration is executed exactly once during React StrictMode double-mounting.

---

## 2. Component Blueprint & Routes

```
apps/web/src/
├── app/
│   ├── login/
│   │   └── page.tsx                     # Route: /login (Suspense-wrapped)
│   └── auth/
│       └── google/
│           └── callback/
│               └── page.tsx             # Route: /auth/google/callback (Suspense-wrapped)
├── components/
│   └── auth/
│       ├── google-auth-button.tsx       # "Continue with Google" button with brand SVG
│       ├── login-form.tsx               # Login form, validation, error mapping, and returnUrl
│       └── google-callback-content.tsx  # OAuth callback completion and session restoration
└── lib/
    └── api/
        ├── types.ts                     # LoginDto, LoginResponseData contracts
        ├── auth-client.ts               # login(), getGoogleAuthUrl() methods
        └── redirect-utils.ts            # getSafeRedirectUrl() open-redirect sanitization
```

---

## 3. Endpoints & API Contracts

All endpoints communicate via the centralized `apiClient` using `credentials: 'include'`.

### 3.1 Email / Password Login
- **Endpoint**: `POST /api/v1/auth/login`
- **Request Body (`LoginDto`)**:
  ```json
  {
    "email": "user@andemta.et",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresIn": 900,
      "user": {
        "id": "c1f7a049-74d1-4db8-b570-5b5832a52df4",
        "email": "user@andemta.et",
        "emailVerifiedAt": "2026-11-22T10:00:00.000Z"
      }
    },
    "meta": null
  }
  ```
  *(Backend also sets the HttpOnly cookie `andemta_refresh`).*
- **Error Responses**:
  - `HTTP 401 Unauthorized` (`Invalid email or password`) $\rightarrow$ Generic error message.
  - `HTTP 401 Unauthorized` (`Email verification is required before logging in...`) $\rightarrow$ Prompts user to check inbox with link to resend verification.
  - `HTTP 429 Too Many Requests` $\rightarrow$ Rate limiting message.

### 3.2 Google OAuth Initiation
- **Initiation URL**: `GET /api/v1/auth/google` (via `authClient.getGoogleAuthUrl()`)
- **Behavior**: Browser navigation to backend. The backend generates PKCE verifier, OIDC nonce, and cryptographically random state in Redis, then issues a 302 redirect to Google accounts.

### 3.3 Google OAuth Callback & Session Restoration
- **Frontend Success Destination**: `/auth/google/callback`
  - Backend sets HttpOnly cookie and redirects here upon successful token exchange.
  - Component calls `authContext.refreshSession()`, which triggers `POST /api/v1/auth/refresh`.
  - In-memory `tokenManager` stores the new access token.
  - React `AuthContext` updates user state and navigates to `getSafeRedirectUrl(returnUrl)`.
- **Frontend Failure Destination**: `/login?error=<safeCode>`
  - Backend sanitizes failure codes to safe public keys:
    - `account_linking_required` $\rightarrow$ Account exists; prompts user to sign in with password to link Google account.
    - `unverified_email` $\rightarrow$ Google email address is unverified.
    - `access_denied` $\rightarrow$ User cancelled Google sign-in.
    - `auth_failed` $\rightarrow$ Generic Google authentication failure.

---

## 4. Open-Redirect Prevention

Redirect destinations are validated via `getSafeRedirectUrl()`:
```ts
export function getSafeRedirectUrl(candidate?: string | null, defaultPath = '/'): string {
  if (!candidate || typeof candidate !== 'string') return defaultPath;
  const trimmed = candidate.trim();
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
```

---

## 5. Testing & Verification

Run the test suites:

```bash
npm run test:web
```

Coverage:
- `redirect-utils.spec.ts`: Open-redirect prevention, protocol rejection, double-slash rejection, and valid path handling.
- `auth-client-login.spec.ts`: Login submission, token storage in memory, 401 handling, 429 rate limiting, and Google initiation URL generation.
- `login-validation.spec.ts`: Input validation, unverified email message mapping, generic error mapping, and duplicate submission prevention.
- `google-oauth-flow.spec.ts`: Initiation URL check, no client secret exposure, session restoration on callback, StrictMode deduplication, and failure code mapping.
- All Phase 3.10 and Phase 3.11 regression tests.
