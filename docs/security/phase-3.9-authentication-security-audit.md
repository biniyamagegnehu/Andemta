# Phase 3.9 — Authentication Security Audit

**Project:** Andemta  
**Auditor:** Antigravity (AI Security Audit, Phase 3.9)  
**Audit Date:** 2026-11-19  
**Audit Type:** Read-only static inspection  
**Phases Covered:** 3.1 – 3.8  
**Report Status:** Final  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Reviewed](#2-architecture-reviewed)
3. [Findings — Area A: Registration & Email Verification](#3-area-a--registration--email-verification)
4. [Findings — Area B: Password Login & Access Tokens](#4-area-b--password-login--access-tokens)
5. [Findings — Area C: Refresh Tokens & Session Management](#5-area-c--refresh-tokens--session-management)
6. [Findings — Area D: Password Recovery](#6-area-d--password-recovery)
7. [Findings — Area E: Google OAuth 2.0](#7-area-e--google-oauth-20)
8. [Findings — Area F: CSRF, CORS, Cookies & HTTP Security](#8-area-f--csrf-cors-cookies--http-security)
9. [Findings — Area G: Rate Limiting & Abuse Prevention](#9-area-g--rate-limiting--abuse-prevention)
10. [Findings — Area H: Database & Concurrency Security](#10-area-h--database--concurrency-security)
11. [Findings — Area I: Logging, Errors & Information Disclosure](#11-area-i--logging-errors--information-disclosure)
12. [Findings — Area J: Configuration & Deployment Readiness](#12-area-j--configuration--deployment-readiness)
13. [Findings — Area K: Automated Test Coverage](#13-area-k--automated-test-coverage)
14. [Security Strengths](#14-security-strengths)
15. [Production Readiness Checklist](#15-production-readiness-checklist)
16. [Recommended Remediation Order](#16-recommended-remediation-order)
17. [Limitations](#17-limitations)

---

## 1. Executive Summary

### 1.1 Findings by Severity

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 4 |
| INFORMATIONAL | 6 |
| **Total** | **19** |

### 1.2 Critical Finding

**[G-01] No rate limiting exists on any authentication endpoint.** Every endpoint — registration, login, forgot-password, verify-email, resend-verification, refresh, and the Google OAuth callback — is completely open to unlimited automated requests. This enables credential stuffing, brute-force login attacks, password-reset token enumeration, and verification-token flooding at zero cost to the attacker.

### 1.3 Production Readiness

The authentication system is **NOT safe for production deployment in its current state.** The absence of rate limiting alone is a showstopper. Additionally, Swagger is enabled by default and contains no authentication gate for the documentation endpoint itself; the CSRF guard's fallback explicitly allows requests with neither `Origin` nor `Referer` headers; and there is no mechanism to revoke or deny JWTs before their natural expiry after a password change or account deletion.

Architecturally the system is well-designed, with strong choices throughout: Argon2id password hashing, opaque refresh tokens stored only as SHA-256 hashes, token-family reuse detection, atomic transaction-based token consumption, PKCE S256 + OIDC nonce for Google OAuth, and comprehensive structured logging with secret redaction. These are professional-grade security foundations. The gaps below are real but fixable, and no fundamental re-architecture is required.

---

## 2. Architecture Reviewed

### 2.1 Files Inspected

| File | Phase |
|---|---|
| `apps/api/prisma/schema.prisma` | 3.1 |
| `apps/api/src/modules/auth/auth.service.ts` | 3.2 – 3.6 |
| `apps/api/src/modules/auth/auth.controller.ts` | 3.2 – 3.8 |
| `apps/api/src/modules/auth/auth.module.ts` | 3.2 |
| `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | 3.4 |
| `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` | 3.4 |
| `apps/api/src/modules/auth/guards/csrf-origin.guard.ts` | 3.5 |
| `apps/api/src/modules/auth/services/password-hashing.service.ts` | 3.2 |
| `apps/api/src/modules/auth/services/email-verification.service.ts` | 3.3 |
| `apps/api/src/modules/auth/services/session.service.ts` | 3.5 |
| `apps/api/src/modules/auth/services/password-reset.service.ts` | 3.7 |
| `apps/api/src/modules/auth/services/google-oauth.service.ts` | 3.8 |
| `apps/api/src/modules/auth/decorators/current-user.decorator.ts` | 3.6 |
| `apps/api/src/modules/auth/utils/token.utils.ts` | 3.3 – 3.7 |
| `apps/api/src/modules/auth/utils/cookie.utils.ts` | 3.5 |
| `apps/api/src/modules/auth/constants/auth.constants.ts` | 3.2, 3.4 |
| `apps/api/src/modules/auth/dto/register.dto.ts` | 3.2 |
| `apps/api/src/modules/auth/dto/login.dto.ts` | 3.4 |
| `apps/api/src/modules/auth/dto/forgot-password.dto.ts` | 3.7 |
| `apps/api/src/modules/auth/dto/reset-password.dto.ts` | 3.7 |
| `apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts` | 3.4 |
| `apps/api/src/config/configuration.ts` | All |
| `apps/api/src/config/validation.schema.ts` | All |
| `apps/api/src/redis/redis.service.ts` | 3.8 |
| `apps/api/src/database/prisma.service.ts` | 3.1 |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | All |
| `apps/api/src/common/pipes/validation.pipe.ts` | All |
| `apps/api/src/modules/email/providers/nodemailer-email.provider.ts` | 3.3, 3.7 |
| `apps/api/src/app.module.ts` | All |
| `apps/api/src/main.ts` | All |
| `apps/api/.env.example` | All |

### 2.2 Test Files Identified

**Unit tests (7 suites):**  
`auth.service.spec.ts`, `auth.controller.spec.ts`, `email-verification.service.spec.ts`, `google-oauth.service.spec.ts`, `password-hashing.service.spec.ts`, `password-reset.service.spec.ts`, `session.service.spec.ts`

**E2E tests (7 suites):**  
`app.e2e-spec.ts`, `auth-email-verification.e2e-spec.ts`, `auth-google.e2e-spec.ts`, `auth-login.e2e-spec.ts`, `auth-password-recovery.e2e-spec.ts`, `auth-registration.e2e-spec.ts`, `auth-session.e2e-spec.ts`

**Confirmed pass results (from prior phase runs):**  
- Unit: 39/39 tests passing  
- E2E: 53/53 tests passing  

---

## 3. Area A — Registration & Email Verification

### Finding A-01

| Field | Detail |
|---|---|
| **ID** | A-01 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | Registration reveals account existence via distinct error message |
| **Files** | `auth.service.ts:71-72` |

**Current behavior:**  
The registration endpoint returns a `409 Conflict` with the message `"An account with this email already exists"` when attempting to register with an existing email.

```typescript
// auth.service.ts:71-72
if (existing) {
  throw new ConflictException('An account with this email already exists');
}
```

**Why it is a problem:**  
An attacker can enumerate registered email addresses by submitting a list of candidate emails to `POST /api/v1/auth/register` and noting which responses return 409 vs. 201. This is a lesser enumeration vector than login (which has timing mitigations), but still confirms account existence without authentication.

**Attack scenario:**  
Automated script submits 10,000 emails. All that return 409 are known registered accounts, which can then be targeted with phishing or credential stuffing.

**Remediation:**  
Accept-or-silent design: Return 201 for all requests regardless of whether the email already exists, and always dispatch a "you already have an account" email to the address. This eliminates enumeration while maintaining UX clarity for the legitimate owner.

**Note:** This is an accepted trade-off in many systems. If the product decision is to keep the 409 response for UX reasons, the remaining vectors (login timing, resend-verification) are already mitigated.

---

### Finding A-02

| Field | Detail |
|---|---|
| **ID** | A-02 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | No minimum password strength beyond length and length cap |
| **Files** | `register.dto.ts:35-36`, `reset-password.dto.ts:28-29` |

**Current behavior:**  
Password validation enforces `MinLength(12)` and `MaxLength(128)` only.

```typescript
// register.dto.ts:35-36
@MinLength(12, { message: 'password must be at least 12 characters long' })
@MaxLength(128, { message: 'password must be at most 128 characters long' })
```

**Why it is a problem:**  
A password of `aaaaaaaaaaaa` (12 identical characters) passes validation. Users can set trivially guessable passwords that happen to be 12+ characters long. This slightly undermines the otherwise strong Argon2id hashing layer.

**Remediation:**  
Add a complexity validator (using `class-validator`'s `@Matches` or a custom decorator) requiring at least one uppercase letter, one lowercase letter, and one digit or symbol. Alternatively, consider a client-side zxcvbn strength meter for UX (outside this phase's scope).

---

### Finding A-03

| Field | Detail |
|---|---|
| **ID** | A-03 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Email verification token design is correct |

Tokens are 256-bit random, stored only as SHA-256 hashes, consumed atomically, invalidated on reissue, and delivery failures auto-invalidate the token. `verifyEmail` uses a conditional `updateMany` inside a transaction to prevent double-consumption. The generic response on `resend-verification` correctly prevents account enumeration. No issues found.

---

## 4. Area B — Password Login & Access Tokens

### Finding B-01

| Field | Detail |
|---|---|
| **ID** | B-01 |
| **Severity** | MEDIUM |
| **Classification** | Confirmed |
| **Title** | JWT access tokens remain valid after password reset / account compromise |
| **Files** | `auth.service.ts:316-321`, `jwt.strategy.ts:52-68` |

**Current behavior:**  
After `resetPassword` is called, all refresh-token sessions are revoked. However, any currently issued JWT access tokens remain valid until their natural expiry (default: 15 minutes). `JwtStrategy.validate()` checks only that the user exists and their email is verified — it does not check whether the user's password was recently changed, or whether the token was issued before or after the password reset.

```typescript
// jwt.strategy.ts:52-68
const user = await this.prisma.user.findUnique({
  where: { id: sub },
  select: { id: true, email: true, emailVerifiedAt: true },
});
// No check for passwordChangedAt or any revocation list
```

**Why it is a problem:**  
If an attacker has stolen a valid JWT (e.g., from XSS), the victim resetting their password does NOT immediately invalidate the attacker's access token. For up to 15 minutes after the reset, the attacker retains API access.

**Attack scenario:**  
1. Attacker steals JWT via XSS or log exposure.  
2. Victim discovers compromise and resets password.  
3. All refresh sessions are revoked — but the stolen JWT remains valid for up to 15 minutes.

**Remediation:**  
Several options (choose one):  
- **Store `passwordChangedAt` timestamp** on the User model and check in `JwtStrategy.validate()` that `iat > passwordChangedAt`. (Requires a migration.)  
- **Redis blocklist:** On password reset, write `jti` → revoked for the remaining TTL to Redis; check in `JwtStrategy.validate()`.  
- **Reduce access token TTL** to 5 minutes or less (reduces but does not eliminate the window).  

The 15-minute default TTL is acceptable for most applications but should be explicitly documented as an accepted risk if not mitigated.

---

### Finding B-02

| Field | Detail |
|---|---|
| **ID** | B-02 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Timing attack mitigation for account enumeration is correctly implemented |

```typescript
// auth.service.ts:184-191
if (!user || !user.passwordHash) {
  await this.passwordHashingService.verify(DUMMY_ARGON2_HASH, dto.password);
  throw new UnauthorizedException('Invalid email or password');
}
```

The dummy hash uses the same Argon2id parameters as real hashes, making timing indistinguishable between "user not found" and "wrong password". The error message is generic. No issues found.

---

### Finding B-03

| Field | Detail |
|---|---|
| **ID** | B-03 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | JWT algorithm is explicitly pinned to HS256 |

Both `JwtModule` configuration (`auth.module.ts:34`) and `JwtStrategy` (`jwt.strategy.ts:30`, `algorithms: ['HS256']`) explicitly specify the algorithm. This prevents the `alg: none` and algorithm confusion attacks. The secret is validated to be at least 32 characters in `JwtStrategy` constructor (`jwt.strategy.ts:20-22`). No issues found.

---

### Finding B-04

| Field | Detail |
|---|---|
| **ID** | B-04 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | No minimum `JWT_ACCESS_SECRET` entropy requirement beyond length |
| **Files** | `validation.schema.ts:42`, `jwt.strategy.ts:20-22` |

**Current behavior:**  
The validation schema requires `JWT_ACCESS_SECRET` to be at least 32 characters (`Joi.string().min(32).required()`). The strategy also throws if the secret is shorter than 32 characters. However, the validation accepts a 32-character string of all the same character (e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`).

**Remediation:**  
Add a configuration-level check that the secret's Shannon entropy is above a threshold (e.g., using `crypto.randomBytes(32).toString('hex')` as the generation method and documenting this explicitly in `.env.example`). The `.env.example` currently uses a placeholder string; update it to a generated random value and add a comment explaining the requirement.

---

## 5. Area C — Refresh Tokens & Session Management

### Finding C-01

| Field | Detail |
|---|---|
| **ID** | C-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Refresh token rotation and reuse detection are correctly implemented |

The session service (`session.service.ts:127-254`) implements a full token-family rotation scheme:  
- Each rotation creates a new session record inheriting the same `tokenFamily`.  
- Presentation of a previously rotated token is detected via `rotatedAt !== null`.  
- On reuse detection, **the entire token family is revoked** with `updateMany` on `tokenFamily`.  
- The transaction uses a conditional `updateMany({ where: { id, rotatedAt: null } })` to prevent concurrent rotation races.  
- All tokens are stored exclusively as SHA-256 hashes; no raw token is ever written to the database.  

No issues found in this area.

---

### Finding C-02

| Field | Detail |
|---|---|
| **ID** | C-02 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | Stale/revoked/expired sessions accumulate in the database indefinitely |
| **Files** | `schema.prisma:35-54`, `session.service.ts` |

**Current behavior:**  
Sessions are soft-deleted (marked with `revokedAt`) or left expired (`expiresAt` in the past), but no cleanup mechanism removes them from the `sessions` table.

**Why it is a problem:**  
Over time, the sessions table grows unboundedly with expired and revoked rows. This degrades query performance for high-volume tables and increases the blast radius of a database dump.

**Remediation:**  
Add a scheduled job (using the existing BullMQ/JobsModule infrastructure) that periodically `DELETE FROM sessions WHERE (revokedAt IS NOT NULL OR expiresAt < NOW()) AND created_at < NOW() - INTERVAL '7 days'`. Similarly for `email_verification_tokens` and `password_reset_tokens`.

---

## 6. Area D — Password Recovery

### Finding D-01

| Field | Detail |
|---|---|
| **ID** | D-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Password reset design is correct |

The `forgotPassword` flow (`password-reset.service.ts:73-140`) correctly:  
- Returns a uniform generic response regardless of whether the email exists.  
- Invalidates previous unused tokens before creating a new one.  
- If email delivery fails, immediately invalidates the newly created token.  
- Stores only the SHA-256 hash; never logs the raw URL.

The `resetPassword` flow (`password-reset.service.ts:157-242`) correctly:  
- Checks expiry, consumption, and user validity before accepting the token.  
- Uses an atomic `$transaction` with a conditional `updateMany({ where: { id, usedAt: null } })` to prevent concurrent double-use.  
- Revokes all active sessions after the password is updated.

No issues found.

---

### Finding D-02

| Field | Detail |
|---|---|
| **ID** | D-02 |
| **Severity** | MEDIUM |
| **Classification** | Potential |
| **Title** | No rate limiting on `POST /forgot-password` enables token-spam and resource exhaustion |
| **Files** | `auth.controller.ts:121-145`, `password-reset.service.ts:73` |

This is a specific instance of the broader [G-01] finding. The `forgot-password` endpoint:  
1. Performs a database lookup (1 write to invalidate old tokens, 1 write to create a new token).  
2. Triggers an SMTP email dispatch (expensive resource).  

An attacker who knows a victim's email address can flood the endpoint with requests, causing:  
- Spam inbox flooding for the victim.  
- Unnecessary SMTP charges.  
- Argon2id password hash operations on `reset-password` if fake tokens are submitted.

**Remediation:**  
IP-based rate limiting (e.g., 5 requests per 15 minutes per IP per email) using `@nestjs/throttler`. See [G-01] for the broader implementation plan.

---

## 7. Area E — Google OAuth 2.0

### Finding E-01

| Field | Detail |
|---|---|
| **ID** | E-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Google OAuth implementation uses PKCE S256 + OIDC nonce with atomic state consumption |

`google-oauth.service.ts` correctly implements:  
- 256-bit random `state`, `nonce`, and `codeVerifier` per flow (`randomBytes(32).toString('base64url')`).  
- PKCE S256 code challenge derived from `codeVerifier`.  
- State stored in Redis with TTL (default 300s).  
- State consumed atomically with `getdel` (ioredis native command), preventing state replay.  
- OIDC nonce verified against stored transaction value before accepting the ID token (`payload.nonce !== transaction.nonce`).  
- `email_verified: true` enforced before accepting Google identity.  
- Explicit audience check in `verifyIdToken({ audience: this.clientId })`.

No issues found.

---

### Finding E-02

| Field | Detail |
|---|---|
| **ID** | E-02 |
| **Severity** | MEDIUM |
| **Classification** | Confirmed |
| **Title** | Error codes in Google OAuth callback redirect expose implementation details |
| **Files** | `google-oauth.service.ts:99-103`, `auth.controller.ts:239-247` |

**Current behavior:**  
When the Google OAuth flow fails, the user is redirected to the frontend failure URL with a machine-readable error code as a query parameter:

```
http://localhost:3000/login?error=invalid_or_expired_state
http://localhost:3000/login?error=token_exchange_failed
http://localhost:3000/login?error=nonce_mismatch
http://localhost:3000/login?error=account_linking_required
```

**Why it is a problem:**  
Detailed error codes like `nonce_mismatch` or `corrupted_state` reveal internal OAuth flow implementation details. While this information is primarily useful for the frontend, it could also assist an attacker in fingerprinting the CSRF/replay protection mechanism.

**Remediation:**  
Consider mapping internal error codes to generic user-facing codes (e.g., `auth_failed`, `linking_required`) in the redirects. Keep granular codes in server-side logs only.

---

### Finding E-03

| Field | Detail |
|---|---|
| **ID** | E-03 |
| **Severity** | LOW |
| **Classification** | Potential |
| **Title** | Google OAuth callback session creation is not inside the user-creation transaction |
| **Files** | `google-oauth.service.ts:375-411` |

**Current behavior:**  
In `handleLoginOrRegistration` → Case B (new user registration), the user and external account are created inside a `$transaction` (line 376). However, the session is created _after_ the transaction commits (line 397-401):

```typescript
const createdUser = await this.prisma.$transaction(async (tx) => {
  // User + ExternalAccount created here
  return user;
});

// Session created here, OUTSIDE the transaction
const sessionResult = await this.sessionService.createSession(createdUser.id, ...);
```

**Why it is a problem:**  
If the server crashes or the session creation fails after the transaction commits, a user account exists in the database with no active session. The user would need to log in again via Google, which works correctly, so the practical impact is minimal. However, in a scenario where session creation consistently fails, users would be registered but unable to log in.

**Remediation:**  
Create the session inside the transaction, or catch session creation failures and return a specific error code to the frontend (e.g., `session_creation_failed`) rather than relying on the general `registration_conflict` catch.

---

## 8. Area F — CSRF, CORS, Cookies & HTTP Security

### Finding F-01

| Field | Detail |
|---|---|
| **ID** | F-01 |
| **Severity** | HIGH |
| **Classification** | Confirmed |
| **Title** | `CsrfOriginGuard` explicitly allows requests missing both `Origin` and `Referer` headers |
| **Files** | `csrf-origin.guard.ts:70-72` |

**Current behavior:**

```typescript
// csrf-origin.guard.ts:70-72
// 3. Neither Origin nor Referer is present.
// Allow non-browser / server-to-server / automated test requests.
return true;
```

The guard protects `POST /auth/refresh` and `POST /auth/logout` by checking `Origin` and `Referer` headers. However, if **neither** header is present, the request is allowed without restriction.

**Why it is a problem:**  
The stated rationale ("allow non-browser / server-to-server / automated test requests") is architecturally incorrect for browser-sensitive cookie-carrying endpoints. Modern browsers _always_ send `Origin` on cross-site requests that change state. The requests that lack both headers are:  
1. Requests from non-browser tools (curl, Postman, automated scanners).  
2. Older or misconfigured browsers.  
3. Some same-origin requests (which are acceptable).

An attacker who can get a victim's browser to make a cross-site request _without an Origin header_ (edge case in some older browser versions or due to referrer policy) bypasses the guard entirely. Additionally, server-to-server callers sending the refresh cookie could be impersonating a legitimate user.

The practical CSRF risk is currently **partially mitigated** by the `SameSite=Lax` cookie policy (which prevents cross-site POST requests from sending the cookie in modern browsers), but the guard's intentional bypass represents a gap in defense-in-depth.

**Remediation:**  
In production, consider rejecting requests that lack both headers, or return true only for same-origin requests (where the Origin matches the backend URL). Keep the existing bypass only in `test` environment using `process.env.NODE_ENV === 'test'`. Example:

```typescript
// At line 70-72, replace with:
if (process.env.NODE_ENV === 'test') {
  return true; // Allow headerless requests in test environment
}
throw new ForbiddenException('Untrusted request origin');
```

---

### Finding F-02

| Field | Detail |
|---|---|
| **ID** | F-02 |
| **Severity** | MEDIUM |
| **Classification** | Confirmed |
| **Title** | CORS whitelist hardcodes `localhost` origins in production-applicable code path |
| **Files** | `main.ts:42` |

**Current behavior:**

```typescript
// main.ts:42
app.enableCors({
  origin: [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  ...
  credentials: true,
});
```

The `localhost:3000` and `127.0.0.1:3000` entries are hardcoded unconditionally — they will be in the CORS allowlist even in a production deployment. With `credentials: true`, this means any cross-origin request from `localhost:3000` will pass CORS pre-flight checks in production.

**Why it is a problem:**  
If a developer machine runs a local server on `localhost:3000`, it can make credentialed requests to the production API. While practical exploitation requires the developer's browser to be on the same machine as a malicious page, it widens the CORS surface.

**Remediation:**  
Gate the `localhost` entries behind `!isProduction`:

```typescript
app.enableCors({
  origin: isProduction
    ? [frontendUrl]
    : [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
});
```

---

### Finding F-03

| Field | Detail |
|---|---|
| **ID** | F-03 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Cookie security attributes are correct and environment-aware |

`cookie.utils.ts` sets:  
- `httpOnly: true` — prevents JavaScript access, mitigates XSS token theft.  
- `secure: true` **forced in production** (`cookieSecure` logic in `configuration.ts:102-105`): `NODE_ENV === 'production' ? true : AUTH_COOKIE_SECURE === 'true'`. This is a critical correctness — the secure flag cannot be accidentally misconfigured in production.  
- `sameSite: 'lax'` default — prevents cross-site POST cookie attachment in modern browsers.  
- `path: '/api/v1/auth'` — scope-restricted, preventing the cookie from being sent to unrelated API paths.  
- `maxAge` based on configured `AUTH_REFRESH_TOKEN_TTL_DAYS`.  

No issues found.

---

### Finding F-04

| Field | Detail |
|---|---|
| **ID** | F-04 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | Helmet CSP is disabled in development; must be validated before production |
| **Files** | `main.ts:29-35` |

**Current behavior:**

```typescript
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));
```

CSP is disabled in development to allow Swagger's inline scripts. `crossOriginEmbedderPolicy` is globally disabled without an environment check. No explicit Helmet configuration for `strictTransportSecurity`, `referrerPolicy`, or `permissionsPolicy` is provided — Helmet defaults are used.

**Remediation:**  
Before production deployment, explicitly configure the CSP for the production API context. The API does not serve HTML pages (except Swagger), so an aggressive `default-src 'none'` with only necessary exceptions is feasible. If Swagger is to be disabled in production (`SWAGGER_ENABLED=false`), CSP can be maximally restrictive. Document this in the deployment runbook.

---

## 9. Area G — Rate Limiting & Abuse Prevention

### Finding G-01

| Field | Detail |
|---|---|
| **ID** | G-01 |
| **Severity** | CRITICAL |
| **Classification** | Confirmed |
| **Title** | No rate limiting exists on any authentication endpoint |
| **Files** | `app.module.ts`, `auth.controller.ts`, `main.ts`, `package.json` |

**Current behavior:**  
A search across all authentication source files for `throttle`, `rateLimit`, `rate-limit`, `@Throttle`, `ThrottlerGuard`, `BullMQ` queue-based limiting, or any equivalent middleware returned **zero results**. The `package.json` does not include `@nestjs/throttler`. No IP-based, user-based, or token-based rate limiting is applied to any endpoint.

**Attack scenarios:**

| Endpoint | Attack | Impact |
|---|---|---|
| `POST /auth/login` | Credential stuffing, brute-force | Account takeover |
| `POST /auth/register` | Account spam, email flood | DoS via SMTP, DB bloat |
| `POST /auth/forgot-password` | Password reset spam, victim email flood | DoS, SMTP cost |
| `POST /auth/verify-email` | Token brute-force (SHA-256 token is 256 bits — not feasible, but endpoint is unprotected) | Potential DoS |
| `POST /auth/resend-verification` | SMTP spam per victim | Email DoS |
| `POST /auth/refresh` | Session token brute-force | DoS |
| `GET /auth/google` | OAuth state generation flood, Redis overflow | DoS |

**Remediation:**  
Install `@nestjs/throttler` and configure globally with per-endpoint overrides:

```typescript
// app.module.ts
ThrottlerModule.forRoot([{
  name: 'global',
  ttl: 60000,  // 1 minute
  limit: 60,
}]),
```

Apply strict per-endpoint limits in `auth.controller.ts`:

```typescript
// Login: 5 attempts per 15 minutes per IP
@Throttle({ login: { ttl: 900000, limit: 5 } })
@Post('login')

// Registration: 3 per hour per IP
@Throttle({ register: { ttl: 3600000, limit: 3 } })
@Post('register')

// Forgot-password: 3 per hour per IP
@Throttle({ forgotPw: { ttl: 3600000, limit: 3 } })
@Post('forgot-password')
```

For production, pair IP-based throttling with a Redis-backed store (`ThrottlerStorageRedisService`) to handle multiple API server instances correctly.

---

### Finding G-02

| Field | Detail |
|---|---|
| **ID** | G-02 |
| **Severity** | HIGH |
| **Classification** | Confirmed |
| **Title** | No account lockout or failed-login counter mechanism exists |
| **Files** | `auth.service.ts:166-233`, `schema.prisma` |

**Current behavior:**  
There is no `failedLoginAttempts` field on the `User` model, no lockout timestamp, and no in-memory or Redis-based counter tracking consecutive failed login attempts per account.

**Why it is a problem:**  
Even with IP-based rate limiting (from [G-01]), an attacker operating through a botnet with thousands of IPs can try one password per IP against a single target account. Each IP stays below the rate limit while collectively enumerating thousands of passwords.

**Attack scenario:**  
Distributed credential stuffing: 10,000 IPs each make 1 login attempt per hour against `victim@example.com`. Rate limiting per IP doesn't help. Without account-level lockout, all 10,000 attempts succeed in reaching the Argon2id verification stage.

**Remediation:**  
Track failed login attempts in Redis (key: `login:failed:{email}`, TTL: 15 minutes) and implement progressive lockout:  
- After 5 failed attempts: 5-minute lockout.  
- After 10 attempts: 30-minute lockout.  
- After 20 attempts: 24-hour lockout (or require CAPTCHA/email unlock).

Do not store lockout state in PostgreSQL (adds write contention to the hot login path).

---

## 10. Area H — Database & Concurrency Security

### Finding H-01

| Field | Detail |
|---|---|
| **ID** | H-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Atomic token consumption correctly prevents double-use race conditions |

Both `verifyEmail` (`email-verification.service.ts:208-220`) and `resetPassword` (`password-reset.service.ts:199-213`) use a database transaction with a conditional `updateMany({ where: { id, usedAt: null } })` and check that `count === 0` to detect concurrent consumption. This correctly prevents two simultaneous requests from both consuming the same token.

Session rotation (`session.service.ts:206-224`) similarly uses a conditional `updateMany({ where: { id, rotatedAt: null, revokedAt: null } })` inside a `$transaction`. On conflict (count = 0), it throws `ConflictException`.

---

### Finding H-02

| Field | Detail |
|---|---|
| **ID** | H-02 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | No database query timeout configured on PrismaService |
| **Files** | `database/prisma.service.ts` |

**Current behavior:**  
`PrismaService` extends `PrismaClient` with no timeout configuration. Long-running queries (e.g., due to table bloat from [C-02] — accumulating sessions) will hang until the default PostgreSQL statement timeout or Node.js connection timeout is reached.

**Remediation:**  
Configure query timeout in Prisma:

```typescript
// prisma.service.ts constructor
super({
  datasources: { db: { url: configService.get('database.url') } },
});
```
Or set at the database level via `statement_timeout` in `postgresql.conf` / connection string parameters.

---

### Finding H-03

| Field | Detail |
|---|---|
| **ID** | H-03 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Prisma schema uses appropriate indexes and cascade-delete patterns |

- `Session` has indexes on `userId`, `tokenFamily`, `expiresAt`, `revokedAt`, `rotatedAt` — supporting all query patterns in `session.service.ts`.  
- `EmailVerificationToken` and `PasswordResetToken` have `@unique` on `tokenHash` (implicit B-tree index) and additional indexes on `userId` and `expiresAt`.  
- `ExternalAccount.@@unique([provider, providerAccountId])` prevents duplicate external identity links.  
- All child models (`Session`, `ExternalAccount`, tokens) have `onDelete: Cascade` — user deletion cleanly removes all authentication artifacts.  

No issues found.

---

## 11. Area I — Logging, Errors & Information Disclosure

### Finding I-01

| Field | Detail |
|---|---|
| **ID** | I-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed strength |
| **Title** | Pino logger redacts sensitive headers and body fields |

`app.module.ts:44-50` configures `nestjs-pino` with:

```typescript
redact: [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.refreshToken',
],
```

This correctly redacts the `Authorization` bearer token, cookies (which contain the refresh token), and password from structured logs. No raw tokens, passwords, or secrets appear in log output.

---

### Finding I-02

| Field | Detail |
|---|---|
| **ID** | I-02 |
| **Severity** | MEDIUM |
| **Classification** | Confirmed |
| **Title** | Development mode exposes internal error messages (`exception.message`) to API consumers |
| **Files** | `all-exceptions.filter.ts:65-70` |

**Current behavior:**

```typescript
// all-exceptions.filter.ts:65-70
} else if (exception instanceof Error) {
  if (!isProduction) {
    message = exception.message;  // Raw internal error message returned in response body
  }
}
```

In development mode (`NODE_ENV !== 'production'`), the raw `exception.message` from internal errors is returned in the API response body. This includes Prisma error messages, which can reveal table names, column names, and query structures.

**Why it is a problem:**  
While this is intentional for development, misconfigured staging environments (where `NODE_ENV` is not set to `production`) would expose internal error details to external consumers.

**Remediation:**  
Document explicitly in the deployment runbook that `NODE_ENV=production` is mandatory for any externally accessible environment. Consider adding a `staging` environment that also applies production-level error masking.

---

### Finding I-03

| Field | Detail |
|---|---|
| **ID** | I-03 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | `req.body.newPassword` is not redacted in Pino logs |
| **Files** | `app.module.ts:44-50` |

**Current behavior:**  
The Pino redact configuration includes `req.body.password` but not `req.body.newPassword`. The `POST /auth/reset-password` endpoint receives `{ token, newPassword }`. The `newPassword` field is not redacted and would appear in structured request logs.

**Remediation:**  
Add `'req.body.newPassword'` and `'req.body.token'` to the Pino `redact` array:

```typescript
redact: [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.newPassword',  // Add this
  'req.body.token',        // Add this — reset/verification tokens in body
  'req.body.refreshToken',
],
```

**Note:** Reset and verification tokens in the body are not secret in the same way as passwords (they are single-use and expire), but redacting them is defense in depth.

---

## 12. Area J — Configuration & Deployment Readiness

### Finding J-01

| Field | Detail |
|---|---|
| **ID** | J-01 |
| **Severity** | HIGH |
| **Classification** | Confirmed |
| **Title** | Swagger UI is enabled by default and accessible without authentication |
| **Files** | `main.ts:71-91`, `configuration.ts:58-60`, `validation.schema.ts:23` |

**Current behavior:**

```typescript
// configuration.ts:58-60
swagger: {
  enabled: process.env.SWAGGER_ENABLED !== 'false',  // true by default
},
```

```typescript
// validation.schema.ts:23
SWAGGER_ENABLED: Joi.boolean().default(true),
```

The Swagger UI at `/api/docs` is **enabled by default**. The env example file shows `SWAGGER_ENABLED=true`. There is no authentication gate on the `/api/docs` path — anyone who can reach the API server can view the full API documentation, all endpoint schemas, example payloads, and try out the API interactively with `persistAuthorization: true`.

**Why it is a problem:**  
In production, exposing the Swagger UI:  
- Provides a complete map of all API endpoints to attackers.  
- Allows interactive exploitation via the "Try it out" feature.  
- With `persistAuthorization: true`, tokens stored in Swagger's local storage persist across sessions.

**Remediation:**  
Change the default to disabled (`SWAGGER_ENABLED !== 'true'` or `default: false` in Joi schema). Set `SWAGGER_ENABLED=false` explicitly in the production environment. If documentation access is needed in production, gate it behind IP allowlist or HTTP Basic Auth middleware.

```typescript
// configuration.ts — safer default:
swagger: {
  enabled: process.env.SWAGGER_ENABLED === 'true',  // false by default
},
```

---

### Finding J-02

| Field | Detail |
|---|---|
| **ID** | J-02 |
| **Severity** | MEDIUM |
| **Classification** | Confirmed |
| **Title** | Redis has no authentication configured by default |
| **Files** | `validation.schema.ts:20`, `configuration.ts:69`, `redis.service.ts:13` |

**Current behavior:**

```typescript
// validation.schema.ts:20
REDIS_PASSWORD: Joi.string().optional().allow('').default(''),
```

`REDIS_PASSWORD` defaults to an empty string, meaning Redis authentication is optional. The `.env.example` also shows `REDIS_PASSWORD=` (empty).

**Why it is a problem:**  
Redis stores live OAuth state transactions (including `nonce`, `codeVerifier`, `userId`) with a 5-minute TTL. Without a password:  
- Any service on the same network can read, modify, or delete OAuth state.  
- An attacker who can connect to Redis can inject a fake OAuth transaction and control the OAuth flow.  
- Google OAuth nonces and PKCE verifiers can be stolen.

**Remediation:**  
In production, Redis MUST have a password configured. Add a production-only validation rule, or document prominently in the deployment runbook that `REDIS_PASSWORD` must be set.

---

### Finding J-03

| Field | Detail |
|---|---|
| **ID** | J-03 |
| **Severity** | LOW |
| **Classification** | Confirmed |
| **Title** | No Redis TLS configuration is available |
| **Files** | `redis.service.ts:15-33` |

**Current behavior:**  
`RedisService` creates a plain-text ioredis connection. There is no TLS option, `tls: { ... }` configuration, or `rediss://` URI support.

**Why it is a problem:**  
In a cloud deployment where Redis is on a separate node from the API server (the typical production configuration), OAuth state data (nonces, PKCE verifiers) is transmitted unencrypted over the network.

**Remediation:**  
Add a `REDIS_TLS_ENABLED` environment variable and conditionally enable ioredis TLS when set:

```typescript
const options: RedisOptions = {
  host, port, password,
  tls: configService.get<boolean>('redis.tlsEnabled') ? {} : undefined,
  ...
};
```

---

## 13. Area K — Automated Test Coverage

### Finding K-01

| Field | Detail |
|---|---|
| **ID** | K-01 |
| **Severity** | INFORMATIONAL |
| **Classification** | Confirmed |
| **Title** | Test coverage is comprehensive but lacks security-focused negative test cases |

**Unit tests confirmed:**  
7 test suites covering `AuthService`, `AuthController`, `EmailVerificationService`, `GoogleOAuthService`, `PasswordHashingService`, `PasswordResetService`, `SessionService`.

**E2E tests confirmed:**  
7 test suites covering registration, email verification, login, session management, password recovery, Google OAuth, and app health.

**Missing security-specific test cases:**

| Gap | Description |
|---|---|
| Rate limiting | No tests exist (feature not yet implemented) |
| Token reuse across sessions | The reuse detection path is likely unit-tested but no E2E test confirms the full flow |
| Concurrent token consumption | No explicit concurrent request tests for double-submit prevention |
| Account lockout | No tests (feature not yet implemented) |
| CSRF guard with no headers | No test verifies guard behavior when both Origin and Referer are absent |
| JWT algorithm confusion | No test attempts a `alg: none` or RS256-signed token against the HS256 endpoint |
| Expired session cleanup | No test for the session garbage collection (not yet implemented) |
| Redis unavailability | Behavior of OAuth flow when Redis is unreachable is not E2E tested |

**Remediation:**  
Create a `security.e2e-spec.ts` suite that explicitly tests:  
- CSRF guard rejection of cross-origin requests.  
- Token reuse causing family revocation.  
- Reset token expiry enforcement.  
- Reset token double-use prevention (concurrent requests).

---

## 14. Security Strengths

The following aspects of the implementation are well-designed and merit recognition:

| Strength | Implementation |
|---|---|
| **Argon2id password hashing** | OWASP-recommended parameters: `m=19456, t=2, p=1`. Dummy hash for timing defense. |
| **Opaque refresh tokens** | 256-bit entropy, stored only as SHA-256 hashes. Never exposed in logs or database. |
| **Token-family reuse detection** | Automatic whole-family revocation on reuse — detects token theft even retroactively. |
| **Atomic token consumption** | `$transaction` + conditional `updateMany` prevents double-use across concurrent requests. |
| **Google OAuth PKCE S256 + OIDC nonce** | Full protection against authorization code interception and replay. |
| **Atomic Redis state consumption** | `getdel` atomically validates and consumes OAuth state, preventing state replay. |
| **Environment-aware cookie security** | `secure: true` is forced in `production` regardless of env var value. Cannot be accidentally misconfigured. |
| **Path-scoped refresh cookie** | Cookie path restricted to `/api/v1/auth` — not sent to unrelated API routes. |
| **JWT algorithm pinning** | `algorithms: ['HS256']` in strategy config prevents `alg: none` attacks. |
| **Secret length enforcement** | `JwtStrategy` throws at startup if `JWT_ACCESS_SECRET` is shorter than 32 chars. |
| **Account enumeration defense** | Generic responses on `forgot-password`, `resend-verification`. Timing defense on login. |
| **Pino log redaction** | Authorization header, cookie header, and password body fields are redacted from structured logs. |
| **Helmet security headers** | Enabled globally; CSP disabled only in development for Swagger compatibility. |
| **Email token lifecycle management** | Previous tokens invalidated before issuing new ones; failed deliveries auto-invalidate tokens. |
| **Input validation** | Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`. |
| **Structured exception filter** | Internal stack traces hidden in production; 500 messages normalized. |
| **Email verification required for login** | Both `login` and `JwtStrategy.validate()` enforce verified email, preventing unverified access. |

---

## 15. Production Readiness Checklist

| Item | Status | Finding |
|---|---|---|
| Rate limiting on auth endpoints | ❌ MISSING | G-01 (CRITICAL) |
| Account lockout mechanism | ❌ MISSING | G-02 (HIGH) |
| Swagger disabled by default | ❌ MISSING | J-01 (HIGH) |
| CSRF guard rejects headerless requests in prod | ⚠️ PARTIAL | F-01 (HIGH) |
| CORS whitelist excludes localhost in prod | ⚠️ PARTIAL | F-02 (MEDIUM) |
| Redis authentication required in prod | ⚠️ PARTIAL | J-02 (MEDIUM) |
| Redis TLS enabled in prod | ❌ MISSING | J-03 (LOW) |
| JWT invalidation after password reset | ⚠️ ACCEPTED RISK | B-01 (MEDIUM) |
| `newPassword` redacted from Pino logs | ❌ MISSING | I-03 (LOW) |
| Session/token cleanup job | ❌ MISSING | C-02 (LOW) |
| DB query timeout configured | ❌ MISSING | H-02 (LOW) |
| Helmet CSP configured for production | ⚠️ REVIEW NEEDED | F-04 (LOW) |
| Argon2id hashing | ✅ DONE | — |
| Opaque refresh tokens (SHA-256) | ✅ DONE | — |
| Token reuse detection | ✅ DONE | — |
| Atomic token consumption | ✅ DONE | — |
| PKCE S256 + nonce (Google OAuth) | ✅ DONE | — |
| HttpOnly + Secure + SameSite cookies | ✅ DONE | — |
| Input validation (whitelist, transform) | ✅ DONE | — |
| Email verification enforcement | ✅ DONE | — |
| Timing attack defense (login) | ✅ DONE | — |

---

## 16. Recommended Remediation Order

Address findings in this order before production deployment:

### Must-Fix Before Production (Blockers)

1. **[G-01] Install and configure `@nestjs/throttler`** — per-endpoint rate limiting with Redis-backed store. This is the single highest-priority item.
2. **[J-01] Change Swagger default to disabled** — `SWAGGER_ENABLED !== 'true'` instead of `!== 'false'`.
3. **[G-02] Implement account-level lockout** — Redis-based failed-login counter per email.
4. **[F-01] Harden CSRF guard** — reject headerless requests in production; keep bypass only in `test` environment.
5. **[J-02] Document Redis authentication requirement** — make it explicit in deployment runbook; consider requiring in production via validation schema conditional.

### Should-Fix Before Production

6. **[F-02] Gate localhost CORS origins** — only add localhost in non-production environments.
7. **[B-01] Document or mitigate JWT validity after password reset** — either add `passwordChangedAt` check or document as accepted 15-minute risk.
8. **[I-03] Add `req.body.newPassword` to Pino redact list** — quick 1-line fix.
9. **[J-03] Add Redis TLS support** — required if Redis is on a separate host in cloud deployment.

### Post-Launch Improvements

10. **[C-02] Implement session/token cleanup scheduled job** — prevents DB bloat over time.
11. **[A-01] Consider unified registration response** — eliminates email enumeration via registration.
12. **[E-02] Map OAuth error codes to generic codes** — reduces implementation disclosure.
13. **[H-02] Configure DB query timeout** — operational stability improvement.
14. **[A-02] Add password complexity validator** — improves baseline account security.
15. **[K-01] Add security-focused E2E tests** — concurrent double-submit, CSRF guard, JWT algorithm confusion.

---

## 17. Limitations

This audit was performed under the following constraints:

1. **Read-only static inspection** — no dynamic analysis, fuzzing, penetration testing, or runtime behavior observation was performed. Vulnerabilities that only manifest at runtime (e.g., timing attacks, race conditions under real load) were assessed based on code review only.

2. **No external service interaction** — Google OAuth flows, SMTP email delivery, and actual Redis behavior under production load were not tested. Findings related to these areas are based on code and configuration review.

3. **No database state inspection** — the actual database was not queried. Schema and query pattern analysis was performed from `schema.prisma` and service code only. Actual index usage and query plan efficiency were not measured.

4. **No runtime penetration testing** — CSRF attacks, token theft scenarios, and distributed brute force were analyzed as theoretical scenarios based on code review. No actual attacks were attempted.

5. **No dependency vulnerability scan** — `package.json` dependencies were reviewed for the presence or absence of key packages, but no CVE scan (e.g., `npm audit`) was run as part of this audit. Run `npm audit` before production.

6. **Frontend not reviewed** — this audit covers backend only (Phases 3.1–3.8). Frontend XSS risks, token storage in browser, and client-side input handling are out of scope.

7. **No real secret values examined** — `.env` values were not read. Configuration quality was assessed from `.env.example`, `configuration.ts`, and `validation.schema.ts` only. Actual secret strength in the deployed environment is unknown.

---

*End of Phase 3.9 Security Audit Report*  
*No source code, dependencies, database schema, migrations, or test files were modified during this audit.*  
*Only artifact created: `docs/security/phase-3.9-authentication-security-audit.md`*
