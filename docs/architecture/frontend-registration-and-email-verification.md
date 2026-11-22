# Frontend Registration & Email Verification Architecture (Phase 3.11)

## 1. Overview

Phase 3.11 implements the user registration and email verification frontend interface for **Andemta** (`apps/web`), integrating directly with the NestJS authentication endpoints established in Phases 3.2 and 3.3.

### Core Security & Architectural Principles:
1. **No Automatic Authentication**: Neither successful registration nor successful email verification logs the user in or generates access tokens. Users must complete the standard login flow (Phase 3.12).
2. **Password Policy Fidelity**: Passwords must be between 12 and 128 characters. Passwords are never trimmed or normalized on the frontend—spaces and Unicode characters are preserved.
3. **No Credential / Token Persistence**: Raw verification tokens and passwords are never stored in browser storage (`localStorage`, `sessionStorage`, or cookies) or printed to application logs.
4. **Duplicate Submission Protection**: Form controls prevent concurrent double-submissions, and React StrictMode remount duplicate execution is prevented via component refs.
5. **Account Non-Enumeration**: The resend verification flow returns identical generic responses for existent, non-existent, and already-verified accounts.

---

## 2. User Journeys & Component Blueprint

```
apps/web/src/
├── app/
│   ├── register/
│   │   └── page.tsx                   # Route: /register
│   ├── verify-email/
│   │   └── page.tsx                   # Route: /verify-email?token=...
│   └── resend-verification/
│       └── page.tsx                   # Route: /resend-verification
├── components/
│   └── auth/
│       ├── auth-card.tsx              # Reusable branding card layout
│       ├── register-form.tsx          # Registration form, validation, and success state
│       ├── verify-email-content.tsx   # Token verification lifecycle & status display
│       └── resend-verification-form.tsx # Non-enumerating resend form with 60s cooldown
└── lib/
    └── api/
        ├── types.ts                   # Registration and verification DTOs & response types
        └── auth-client.ts             # register(), verifyEmail(), resendVerification() methods
```

---

## 3. Endpoints & API Contracts

All endpoints communicate via the centralized `apiClient` using `POST` with `skipAuth: true` and `credentials: 'include'`.

### 3.1 User Registration
- **Endpoint**: `POST /api/v1/auth/register`
- **Request Body (`RegisterDto`)**:
  ```json
  {
    "email": "user@andemta.et",
    "password": "SecurePassword123!"
  }
  ```
  *(Note: `confirmPassword` is validated purely on the client and is never sent to the backend).*
- **Success Response (HTTP 201)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "id": "a0b1c2d3-e4f5-4a5b-8c9d-0e1f2a3b4c5d",
      "email": "user@andemta.et",
      "emailVerifiedAt": null,
      "createdAt": "2026-11-22T12:00:00.000Z"
    },
    "meta": null
  }
  ```
- **Error Responses**:
  - `HTTP 409 Conflict`: `{"success": false, "message": "An account with this email already exists"}`
    $\rightarrow$ Renders inline conflict alert directing user to sign in or reset password.
  - `HTTP 400 Bad Request`: `{"success": false, "message": "Validation failed", "errors": [...]}`
    $\rightarrow$ Maps field errors directly to email and password inputs.

### 3.2 Email Verification
- **Endpoint**: `POST /api/v1/auth/verify-email`
- **Verification URL Structure**:
  `http://localhost:3000/verify-email?token=<base64url-token>`
- **Request Body (`VerifyEmailDto`)**:
  ```json
  {
    "token": "dGhpcy1pcy1hLXZhbGlkLWJhc2U2NHVybC10b2tlbg"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Email verified successfully",
    "data": {
      "email": "user@andemta.et",
      "emailVerifiedAt": "2026-11-22T12:05:00.000Z"
    },
    "meta": null
  }
  ```
- **Error Responses**:
  - `HTTP 400 Bad Request`: `{"success": false, "message": "Invalid or expired verification token"}`
    $\rightarrow$ Displays verification failure and offers inline option to request a new link.

### 3.3 Resend Verification Email
- **Endpoint**: `POST /api/v1/auth/resend-verification`
- **Request Body (`ResendVerificationDto`)**:
  ```json
  {
    "email": "user@andemta.et"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "If an account requires email verification, a verification email will be sent.",
    "data": {
      "message": "If an account requires email verification, a verification email will be sent."
    },
    "meta": null
  }
  ```
- **Rate Limit Response (HTTP 429)**:
  $\rightarrow$ Displays friendly rate-limit notice and activates client-side cooldown timer.

---

## 4. Security & Quality Controls

1. **Client-Side Cooldown**: The resend verification form enforces a 60-second visual countdown cooldown to prevent UI spamming, complementing backend Redis throttlers.
2. **Strict Mode Protection**: `VerifyEmailContent` uses `hasSubmittedRef` to prevent double-submitting one-time tokens when React StrictMode mounts components twice during development.
3. **Password Policy**: Enforces minimum 12 and maximum 128 characters without restricting spaces or Unicode characters.
4. **Accessible Elements**: Form controls use standard HTML labels with matching IDs, `aria-describedby` for error text, `aria-invalid` state indicators, and keyboard-navigable password visibility toggles.

---

## 5. Testing & Verification

Execute the test suites:

```bash
npm run test:web
```

Coverage encompasses:
- `register-validation.spec.ts`: Input validation, length bounds, Unicode/spaces support, password mismatch, duplicate submission prevention.
- `auth-client-registration.spec.ts`: DTO serialization, API routing, unauthenticated flag enforcement, 409 conflict, and 400 error handling.
- `verify-email-logic.spec.ts`: Missing token handling, single-flight submission guard, invalid token mapping, and network retry logic.
- `resend-verification-logic.spec.ts`: Non-enumeration response handling, 60-second cooldown timer, and 429 rate limit management.
- All Phase 3.10 authentication foundation regression tests.
