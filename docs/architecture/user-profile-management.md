# User Profile Management — Backend Architecture

**Phase 5.1 — Andemta Ethiopian Consumer Research Marketplace**

This document describes the self-service User Profile data model, API contracts, validation rules, and security boundaries.

---

## 1. Data Model (`User`)

The existing `users` table (Phase 3.1) contained only authentication and identity fields (`id`, `email`, `passwordHash`, `tokenVersion`, `emailVerifiedAt`, `createdAt`, `updatedAt`). To support self-service profile management without exposing or allowing edits to security-sensitive columns, four additive columns were added via migration `20261126000000_add_user_profile_fields`:

| Column | Prisma Field | Type | Default / Nullable | Purpose |
|---|---|---|---|---|
| `full_name` | `fullName` | `TEXT` | `NULL` | Human-readable display name |
| `phone_number` | `phoneNumber` | `TEXT` | `NULL` | Contact phone number (E.164 format) |
| `preferred_language` | `preferredLanguage` | `TEXT` | `'en'` (`NOT NULL`) | Preferred UI language (`en`, `am`, `om`, `ti`) |
| `bio` | `bio` | `TEXT` | `NULL` | Short user biography (max 500 chars) |

All existing user rows are preserved with default values.

---

## 2. API Endpoints

All endpoints use prefix `/api/v1`, require `JwtAuthGuard`, and return the standard `ApiResponse` envelope.

### A. `GET /api/v1/users/me`
Retrieves the authenticated user's full safe profile from PostgreSQL.

- **Auth**: Bearer JWT (`JwtAuthGuard`), user resolved via `@CurrentUser()`.
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "User profile retrieved successfully",
    "data": {
      "id": "uuid",
      "email": "biniyam@andemta.et",
      "emailVerifiedAt": "2026-11-20T00:00:00.000Z",
      "fullName": "Biniyam Tesfaye",
      "phoneNumber": "+251911223344",
      "preferredLanguage": "en",
      "bio": "Consumer research lead.",
      "createdAt": "2026-11-20T00:00:00.000Z",
      "updatedAt": "2026-11-26T00:00:00.000Z"
    },
    "meta": null
  }
  ```

*(Note: `GET /api/v1/auth/me` remains unchanged for lightweight Phase 3 authentication session checks.)*

### B. `PATCH /api/v1/users/me`
Updates the authenticated user's permitted self-service profile fields.

- **Auth**: Bearer JWT (`JwtAuthGuard`), target user resolved strictly via `user.id`.
- **Allowed Request Body (`UpdateProfileDto`)**:
  - `fullName?`: string (`2–120` chars, trimmed) or `null` to clear
  - `phoneNumber?`: string (`^\+?[1-9]\d{6,14}$`) or `null` to clear
  - `preferredLanguage?`: `'en' | 'am' | 'om' | 'ti'`
  - `bio?`: string (max `500` chars, trimmed) or `null` to clear

---

## 3. Security Restrictions

- **Self-service only**: Target user is always `request.user.id`. Client-supplied `id` or `userId` fields are rejected with `400 Bad Request`.
- **Mass assignment prevention**: Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`) rejects unknown or security-sensitive fields (`email`, `passwordHash`, `tokenVersion`, `emailVerifiedAt`, `systemRoles`, `roles`, `permissions`).
- **Secret exclusion**: `SAFE_PROFILE_SELECT` explicitly projects only safe columns; `passwordHash`, `tokenVersion`, and token/session relations are never selected or returned.
- **Separation of concerns**: Email verification and password reset remain exclusively in `AuthModule`.
