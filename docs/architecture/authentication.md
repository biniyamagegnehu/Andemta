# Authentication Architecture & Registration Flow (Phase 3.2)

This document specifies the technical design, security parameters, and operational boundaries of user registration and password hashing in the **Andemta** Consumer Research Marketplace.

---

## 1. Overview & Architectural Boundaries

Phase 3.2 implements secure credential-based user registration within the NestJS backend (`apps/api`).

### Explicit Scope Boundaries
- **Backend Only**: Implemented exclusively in NestJS (`@andemta/api`). No frontend registration forms or components are part of this step.
- **Isolated Registration**: Registration persists identity records (`users` table) only. It **does NOT** issue JWT access tokens, create sessions, generate refresh tokens, or send verification emails.
- **Future Integration Points**: Downstream phases build upon this foundation:
  - **Phase 3.3**: Email verification tokens and transactional delivery via BullMQ.
  - **Phase 3.4**: Credential authentication (login), JWT issuance, and session management.
  - **Phase 3.5**: Refresh token rotation and session revocation.
  - **Phase 3.6**: Password reset flow.
  - **Phase 3.7**: Google OAuth integration.

---

## 2. Password Hashing with Argon2id

### Why Argon2id?
Argon2 was selected as the sole password hashing algorithm for Andemta following OWASP and modern cryptographic recommendations:
- **Winner of the Password Hashing Competition (PHC)**: Argon2 is the recognized standard for password storage.
- **Argon2id Hybrid Mode**: Combines data-independent memory access (Argon2i, resisting side-channel timing attacks) with data-dependent memory access (Argon2d, resisting GPU and ASIC brute-force cracking).
- **Superior Memory Hardness**: Unlike legacy bcrypt or PBKDF2, Argon2id requires significant configurable physical RAM, rendering specialized hardware attacks economically impractical.

### OWASP Minimum Parameter Configuration
All hashing parameters are centralized in `apps/api/src/modules/auth/constants/auth.constants.ts`:

```typescript
export const ARGON2_CONFIG: argon2.HashOptions = {
  type: argon2.argon2id, // Argon2id hybrid variant (type 2)
  memoryCost: 19456,     // 19 MiB (19,456 KiB) RAM requirement
  timeCost: 2,           // 2 computational iterations
  parallelism: 1,        // 1 computational lane / thread
};
```

### PasswordHashingService Implementation
Located in `apps/api/src/modules/auth/services/password-hashing.service.ts`:
- **`hash(plaintext: string): Promise<string>`**: Computes a cryptographically random salted Argon2id hash using the centralized configuration.
- **`verify(hash: string, plaintext: string): Promise<boolean>`**: Compares plaintext against the stored Argon2id string. Malformed hashes, corrupt headers, or incompatible formats are safely caught and return `false` without throwing uncaught exceptions.

---

## 3. Password Policy & Validation

Password rules are enforced at the API boundary via `RegisterDto` with `class-validator` and `class-transformer`:

| Criterion | Rule | Security Justification |
|---|---|---|
| **Minimum Length** | 12 characters | Aligns with NIST SP 800-63B and OWASP guidelines to resist dictionary and rainbow table attacks. |
| **Maximum Length** | 128 characters | Enforces an upper bound to prevent algorithmic denial-of-service (CPU/memory exhaustion) during hashing of oversized payloads. |
| **Character Diversity** | Unconstrained (Spaces & Unicode supported) | Does not restrict characters. Full support for Unicode characters (including Ethiopic Ge'ez script, e.g., `ሰላም ዓለም`) and internal spaces to encourage strong passphrases. |
| **Required & String** | `@IsNotEmpty()`, `@IsString()` | Rejects empty strings, arrays, objects, or null values. |

---

## 4. Email Normalization & Concurrency Handling

Email addresses serve as unique account identifiers and must be deterministic:

### Normalization Pipeline
1. **Trimming**: Strips leading and trailing whitespace (`.trim()`).
2. **Lowercasing**: Converts characters to lowercase (`.toLowerCase()`) to ensure case-insensitive identity matching.
3. **Multi-layer Enforcement**:
   - **DTO Boundary**: Handled via `class-transformer`'s `@Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)` before `class-validator` executes.
   - **Service Boundary**: Defensively applied inside `AuthService.register()` prior to database queries.

### Duplicate Account Protection & Race Conditions
Duplicate registrations are handled through a defense-in-depth strategy:
1. **Proactive Existence Probe**: `AuthService` performs `prisma.user.findUnique({ where: { email: normalizedEmail } })`. If found, it immediately throws `ConflictException('An account with this email already exists')` (HTTP 409).
2. **Concurrent Race Condition Handling**: Under concurrent registration requests with the same email, PostgreSQL enforces the `users_email_key` unique constraint. The resulting Prisma `PrismaClientKnownRequestError` with code `P2002` is caught by `AuthService` and mapped to `ConflictException('An account with this email already exists')` (HTTP 409).
3. **Identical Client Experience**: Both paths return a consistent, uniform HTTP 409 Conflict envelope.

---

## 5. API Specification: `POST /api/v1/auth/register`

### Request Contract
- **Method**: `POST`
- **Route**: `/api/v1/auth/register`
- **Headers**: `Content-Type: application/json`

#### Request Body
```json
{
  "email": "participant@andemta.et",
  "password": "CorrectHorseBatteryStaple2026!"
}
```

### Response Contracts

#### Success Response: `201 Created`
The response contains **only safe user fields**. Plaintext passwords and cryptographic password hashes are strictly omitted from both DTO and Prisma selection queries.

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "e2a9b3d1-4f5c-4a8e-9b7d-1c3f5e7a9b0c",
    "email": "participant@andemta.et",
    "emailVerifiedAt": null,
    "createdAt": "2026-11-05T19:00:00.000Z"
  },
  "meta": null
}
```

#### Validation Error: `400 Bad Request`
Triggered by invalid email formats, passwords shorter than 12 characters, passwords longer than 128 characters, or unexpected non-whitelisted fields.

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [
    {
      "field": "password",
      "message": "password must be at least 12 characters long"
    }
  ]
}
```

#### Duplicate Account: `409 Conflict`
Triggered when an account already exists with the normalized email.

```json
{
  "success": false,
  "message": "An account with this email already exists",
  "data": null,
  "errors": []
}
```

---

## 6. Architectural Decision: Why Registration Does NOT Issue Tokens

In Andemta, registration and session establishment are intentionally decoupled:
1. **Email Verification Precedence**: High-integrity research marketplaces require verified participant identities. Users should verify their email address before receiving interactive access to research activities or organization dashboards.
2. **Attack Surface Minimization**: Issuing JWT tokens or refresh tokens upon registration allows malicious actors to script bulk registrations that automatically populate session caches, Redis stores, and refresh token families.
3. **Explicit Consent & Intent**: Requiring a distinct login step establishes a clear security boundary for user sessions and device tracking.

---

## 7. Security & Privacy Guarantees

- **No Passwords in Application Logs**: `AppModule` configures `pino-http` to redact `req.body.password` and `req.body.refreshToken`. Plaintext passwords never appear in console logs, file logs, or observability pipelines.
- **Selective Prisma Projections**: Queries in `AuthService` explicitly define `select: { id: true, email: true, emailVerifiedAt: true, createdAt: true }` so that `passwordHash` is never loaded into application memory during registration responses.
- **No Non-Whitelisted Properties**: `ValidationPipe` enforces `whitelist: true` and `forbidNonWhitelisted: true`. Clients attempting to inject arbitrary role or permission properties are rejected with HTTP 400.

---

## 8. Next Steps (Roadmap Preview)

- **Phase 3.3: Email Verification Foundation & Token Issuance**
  - Cryptographically secure token generation (SHA-256 stored hash).
  - Asynchronous email dispatch via BullMQ job queues.
  - Endpoint `POST /api/v1/auth/verify-email`.
- **Phase 3.4: Credential Authentication (Login) & JWT Lifecycle**
  - Password verification using `PasswordHashingService`.
  - Short-lived JWT Access Token issuance.
  - Long-lived Refresh Token family creation and database storage in `sessions`.

