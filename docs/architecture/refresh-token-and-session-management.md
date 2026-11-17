# Refresh Tokens and Session Management

## Overview

Phase 3.5 adds opaque refresh token lifecycle management to the Andemta authentication system. It builds directly on the JWT access token infrastructure from Phase 3.4 and the `Session` database model from Phase 3.1.

The core design principles are:

- Refresh tokens are **opaque**, not JWTs — they carry no claims and cannot be decoded
- Only a **SHA-256 hash** of the token is persisted in PostgreSQL; the raw token is never stored
- Raw tokens are delivered exclusively via **HttpOnly, SameSite, path-restricted cookies**
- **Token rotation** is atomic using a Prisma conditional `updateMany`
- **Reuse detection** revokes the entire token family on replay attacks
- **CSRF / origin validation** protects cookie-authenticated endpoints

---

## Architecture Components

```
AuthController           ← HTTP layer: reads/writes cookies, calls services
  ├── POST /auth/login         → creates session, sets refresh cookie
  ├── POST /auth/refresh       → rotates token, sets new cookie (CsrfOriginGuard)
  ├── POST /auth/logout        → revokes token family, clears cookie (CsrfOriginGuard)
  ├── POST /auth/logout-all    → revokes all user sessions (JwtAuthGuard)
  └── GET  /auth/me            → returns current user (JwtAuthGuard)

AuthService              ← Orchestration: delegates to SessionService
SessionService           ← Token generation, hashing, session CRUD
CsrfOriginGuard          ← Validates Origin/Referer headers on cookie endpoints
cookie.utils.ts          ← setRefreshCookie(), clearRefreshCookie() helpers
```

---

## Token Generation

```typescript
// 32 bytes = 256 bits of cryptographic randomness, encoded as Base64URL
crypto.randomBytes(32).toString('base64url')
```

Properties:
- 256 bits of entropy — sufficient for refresh token security
- Base64URL encoding produces 43-character URL-safe strings
- Never stored directly; only the SHA-256 hash persists in the database

### Hashing

```typescript
crypto.createHash('sha256').update(rawToken).digest('hex')
```

- Deterministic: the same raw token always produces the same 64-character hex hash
- One-way: the hash cannot be reversed to obtain the raw token
- Stored in `sessions.refresh_token_hash` with a `@unique` constraint

---

## Session Model

```prisma
model Session {
  id               String    @id @default(uuid())
  userId           String    @map("user_id")
  refreshTokenHash String    @unique @map("refresh_token_hash")  // SHA-256 hex
  tokenFamily      String    @map("token_family")                // UUID, groups rotations
  expiresAt        DateTime  @map("expires_at")
  revokedAt        DateTime? @map("revoked_at")                  // null = active
  rotatedAt        DateTime? @map("rotated_at")                  // null = not yet rotated
  createdAt        DateTime  @default(now()) @map("created_at")
  lastUsedAt       DateTime? @map("last_used_at")
  userAgent        String?   @map("user_agent")
  ipAddress        String?   @map("ip_address")
}
```

**`tokenFamily`** groups all generations of a rotation chain. When a user logs in from a device, they receive a unique `tokenFamily` UUID. Every rotation creates a new session row with the same `tokenFamily`. Reuse detection revokes all rows sharing a `tokenFamily`.

**`rotatedAt`** distinguishes a session that was replaced by rotation (expected) from one that was explicitly revoked (logout). This distinction is what enables reuse detection:

- `rotatedAt = null, revokedAt = null` → active, can be used for refresh
- `rotatedAt = <timestamp>, revokedAt = null` → already rotated (rotation chain continued elsewhere)
- `revokedAt = <timestamp>` → explicitly revoked (logout or reuse-detected)

---

## Cookie Configuration

| Attribute | Value |
|-----------|-------|
| Name | `andemta_refresh` (configurable via `AUTH_REFRESH_COOKIE_NAME`) |
| `httpOnly` | `true` — JavaScript cannot read this cookie |
| `secure` | `true` in production, configurable in development |
| `sameSite` | `lax` (configurable) |
| `path` | `/api/v1/auth` — cookie only sent to auth endpoints |
| `maxAge` | `AUTH_REFRESH_TOKEN_TTL_DAYS` × 86,400,000 ms (default: 30 days) |

The path restriction ensures the browser does not send the cookie on non-auth requests (e.g., fetching marketplace data), limiting exposure.

---

## Login Flow

```
Client                   AuthController              AuthService          SessionService      DB
  │                            │                          │                    │               │
  │  POST /auth/login          │                          │                    │               │
  │  { email, password }       │                          │                    │               │
  │─────────────────────────── │                          │                    │               │
  │                            │── login(dto, ua, ip) ───►│                    │               │
  │                            │                          │── verify password ─────────────────►│
  │                            │                          │                    │               │
  │                            │                          │── generateAccessToken(userId) ──────│
  │                            │                          │                    │               │
  │                            │                          │── createSession() ─►│               │
  │                            │                          │                    │── INSERT ──────►│
  │                            │                          │◄──{ rawToken, session }             │
  │                            │◄─{ accessToken, rawRefreshToken }                             │
  │                            │                          │                    │               │
  │                            │── setRefreshCookie(rawToken) ──────────────────────────────── │
  │◄──────────────────────── Set-Cookie: andemta_refresh=<raw>; HttpOnly; Path=/api/v1/auth     │
  │  200 { accessToken, ... }  │                          │                    │               │
```

---

## Refresh / Token Rotation Flow

```
Client                   AuthController        SessionService                           DB
  │                            │                    │                                    │
  │  POST /auth/refresh        │                    │                                    │
  │  Cookie: andemta_refresh=<token>                │                                    │
  │─────────────────────────── │                    │                                    │
  │                            │── rotateSession() ─►│                                   │
  │                            │                    │── hash(token) ─────────────────────│
  │                            │                    │── findUnique(hash) ─────────────── │
  │                            │                    │                                    │
  │                            │                    │  [Validation checks]               │
  │                            │                    │  • rotatedAt !== null? → REUSE!   │
  │                            │                    │  • revokedAt !== null? → 401       │
  │                            │                    │  • expiresAt <= now()? → 401       │
  │                            │                    │  • emailVerifiedAt null? → 401     │
  │                            │                    │                                    │
  │                            │                    │── $transaction ───────────────────►│
  │                            │                    │   updateMany(id, rotatedAt:null    │
  │                            │                    │             → rotatedAt: now())    │
  │                            │                    │   create(new session, same family) │
  │                            │                    │◄──────────────────────────────────│
  │                            │◄──{ newRawToken, userId, user }                        │
  │                            │── generateAccessToken(userId) ───────────────────────── │
  │                            │── setRefreshCookie(newRawToken) ────────────────────── │
  │◄──────────────── Set-Cookie: andemta_refresh=<newToken>; HttpOnly                   │
  │  200 { accessToken, ... }  │                    │                                    │
```

---

## Reuse Detection

If a refresh token is presented **after it has already been rotated** (i.e., `rotatedAt !== null`), this means either:

1. An attacker stole the original token and is replaying it, or
2. A race condition replayed an old token

**Response:**

```typescript
// Revoke the entire token family (all active sessions on this chain)
await prisma.session.updateMany({
  where: { tokenFamily: session.tokenFamily, revokedAt: null },
  data: { revokedAt: new Date() },
});

// Log a security warning
this.logger.warn(`SECURITY ALERT: Refresh token reuse detected ...`);

// Return generic 401
throw new UnauthorizedException('Invalid or expired refresh token');
```

This forces the user to log in again from scratch and invalidates all devices on the compromised session chain.

---

## Concurrency Safety

Token rotation uses a conditional `updateMany` inside a `$transaction` to prevent race conditions:

```typescript
const [result, newSession] = await prisma.$transaction(async (tx) => {
  const updateResult = await tx.session.updateMany({
    where: {
      id: session.id,
      rotatedAt: null,  // ← conditional: only succeeds if not yet rotated
      revokedAt: null,
    },
    data: { rotatedAt: new Date(), lastUsedAt: new Date() },
  });

  if (updateResult.count === 0) {
    // Another request won the race — throw to rollback the transaction
    throw new ConflictException('Session rotation conflict');
  }

  const newSession = await tx.session.create({ ... });
  return [updateResult, newSession];
});
```

If two simultaneous requests present the same refresh token:
- Exactly **one** achieves `count === 1` and succeeds
- The other gets `count === 0` and throws, triggering a transaction rollback

---

## CSRF / Origin Validation

Cookie-authenticated endpoints (`/refresh`, `/logout`) are protected by `CsrfOriginGuard`:

```
Request has Origin header?
  ├── YES → Is it in trustedOrigins? → ALLOW or 403
  └── NO → Request has Referer header?
              ├── YES → Parse origin, check trustedOrigins → ALLOW or 403
              └── NO  → ALLOW (non-browser / server-to-server client)
```

**Trusted origins in development:**
- `frontendUrl` from config (default: `http://localhost:3000`)
- `http://localhost:3000`, `http://127.0.0.1:3000`
- `http://localhost:4000`, `http://127.0.0.1:4000`

**Production:** Only `frontendUrl` is trusted.

---

## Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/login` | None | Authenticate, receive JWT + set refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Cookie + CsrfOriginGuard | Rotate refresh token, get new JWT |
| `POST` | `/api/v1/auth/logout` | Cookie + CsrfOriginGuard | Revoke current session family |
| `POST` | `/api/v1/auth/logout-all` | Bearer JWT | Revoke all sessions for the user |
| `GET` | `/api/v1/auth/me` | Bearer JWT | Get current user profile |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime in days |
| `AUTH_REFRESH_COOKIE_NAME` | `andemta_refresh` | Cookie name |
| `AUTH_REFRESH_COOKIE_PATH` | `/api/v1/auth` | Cookie path restriction |
| `AUTH_COOKIE_SECURE` | `false` (dev) | Require HTTPS for cookie |
| `AUTH_COOKIE_SAME_SITE` | `lax` | SameSite policy |

---

## Security Properties

| Threat | Mitigation |
|--------|-----------|
| Token theft via XSS | `HttpOnly` cookie — JavaScript cannot access the token |
| Token theft via network | `Secure` flag in production — HTTPS only |
| CSRF attacks | `SameSite=lax` + `CsrfOriginGuard` Origin/Referer validation |
| Token replay after rotation | `rotatedAt` field + reuse detection + family revocation |
| Race-condition replay | Conditional `updateMany` in `$transaction` |
| DB dump exposure | Only SHA-256 hash stored; raw token never persisted or logged |
| Token enumeration in logs | Raw token and hash are never logged |
| Persistent access after password change | `revokeAllUserSessions` can be called on password change |
