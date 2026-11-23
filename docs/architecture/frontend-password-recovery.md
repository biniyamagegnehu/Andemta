# Frontend Password Recovery Architecture (Phase 3.13)

## 1. Overview

Phase 3.13 implements the password recovery and reset user experience for **Andemta** (`apps/web`), integrating with the backend password recovery endpoints (`/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password`).

### Core Security & Architectural Principles:
1. **Account Enumeration Defense**:
   - The forgot-password endpoint returns an identical generic response ("If an account exists for this email address, password reset instructions will be sent.") regardless of whether the email is registered or unverified.
   - The UI displays the exact same confirmation state for all submissions.
2. **Password Policy Fidelity**:
   - New passwords must meet the 12–128 character policy. Spaces and Unicode characters are supported and never trimmed.
   - `confirmPassword` is validated client-side only and is never transmitted to the backend.
3. **Zero Token Persistence**:
   - One-time reset tokens extracted from the URL query parameter (`?token=...`) are consumed directly into API request memory and are never persisted to `localStorage`, `sessionStorage`, or cookies.
4. **Session Revocation & Frontend State Reset**:
   - Backend password reset invalidates all active sessions and increments the user's `tokenVersion`.
   - On completion, `authClient.resetPassword()` executes `tokenManager.clearAccessToken()` in its `finally` block to guarantee stale access tokens are purged from client memory.
5. **No Automatic Authentication**:
   - The user is directed to `/login?reset=success` upon successful reset and must authenticate with their new credentials.

---

## 2. Component Blueprint & Routes

```
apps/web/src/
├── app/
│   ├── forgot-password/
│   │   └── page.tsx                     # Route: /forgot-password
│   └── reset-password/
│       └── page.tsx                     # Route: /reset-password?token=... (Suspense-wrapped)
├── components/
│   └── auth/
│       ├── forgot-password-form.tsx     # Forgot password form with generic non-enumerating confirmation
│       └── reset-password-form.tsx      # Reset password form, token extraction, and validation
└── lib/
    └── api/
        ├── types.ts                     # ForgotPasswordDto, ResetPasswordDto contracts
        └── auth-client.ts               # forgotPassword(), resetPassword() methods
```

---

## 3. Endpoints & API Contracts

All endpoints communicate via the centralized `apiClient` using `POST` with `skipAuth: true` and `credentials: 'include'`.

### 3.1 Forgot Password
- **Endpoint**: `POST /api/v1/auth/forgot-password`
- **Request Body (`ForgotPasswordDto`)**:
  ```json
  {
    "email": "user@andemta.et"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "If an account exists for this email address, password reset instructions will be sent.",
    "data": {},
    "meta": null
  }
  ```
- **Error Responses**:
  - `HTTP 400 Bad Request`: Validation failure (invalid email format).
  - `HTTP 429 Too Many Requests`: Rate limit reached.
- **Account Enumeration Defense**: The response is completely identical whether the email belongs to an existing user or not.

### 3.2 Reset Password
- **Endpoint**: `POST /api/v1/auth/reset-password`
- **Reset URL Structure**:
  `http://localhost:3000/reset-password?token=<base64url-token>`
- **Request Body (`ResetPasswordDto`)**:
  ```json
  {
    "token": "E1dY9_X1Qo0Q1s_wYx7u3A9-V1b-1234567890abcdef",
    "newPassword": "NewSecurePassword123!"
  }
  ```
  *(Note: `confirmPassword` is validated client-side and omitted from the network payload).*
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Password has been reset successfully",
    "data": {},
    "meta": null
  }
  ```
- **Error Responses**:
  - `HTTP 400 Bad Request` (`Invalid or expired password reset token`): Token is missing, expired, invalid, or already used $\rightarrow$ Displays explanation and links to `/forgot-password`.
  - `HTTP 400 Bad Request` (`Validation failed`): Password fails length or common password rules $\rightarrow$ Maps field errors.
  - `HTTP 429 Too Many Requests`: Throttled attempts notice.

---

## 4. Token Extraction & Missing Token Handling

The reset token is extracted from the query parameters using Next.js `useSearchParams()` within a React `<Suspense>` boundary:
```ts
const searchParams = useSearchParams();
const token = searchParams.get('token');
```
If `!token || !token.trim()`, the component renders a friendly "Reset Link Incomplete" state with a direct button to `/forgot-password`.

---

## 5. Testing & Verification

Run the test suites:

```bash
npm run test:web
```

Coverage:
- `auth-client-password-recovery.spec.ts`: API client forgot-password and reset-password methods, token clearance in memory, 400 error handling, and 429 rate limiting.
- `forgot-password-validation.spec.ts`: Email input validation, non-enumeration confirmation, 429 handling, and duplicate submission prevention.
- `reset-password-validation.spec.ts`: Token presence check, 12-128 character policy, space and Unicode support, confirm password matching and payload omission, invalid token error handling, and state clearance.
- Regression tests covering all Phases 3.10–3.12.
