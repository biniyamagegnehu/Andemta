# User Profile Management — Frontend Architecture

**Phase 5.1 (Frontend) — Andemta Ethiopian Consumer Research Marketplace**

This document describes the frontend `/profile` route, components, API integration, validation, and authentication behavior.

---

## 1. Route & Layout Integration

- **Route**: `/profile` (`apps/web/src/app/(authenticated)/profile/page.tsx`)
- **Layout**: Lives inside the `(authenticated)` route group (`AuthenticatedLayout`), which waits for `AuthProvider.isInitialized` and redirects unauthenticated users to `/login?returnUrl=%2Fprofile`.
- **Navigation Entry Point**: Accessible on both desktop and mobile via `UserAccountMenu` (`apps/web/src/components/layout/user-account-menu.tsx`) in `AppHeader`. `getAuthenticatedPageTitle('/profile')` resolves to `'Profile'`.

---

## 2. Components

- **`ProfileOverviewCard`** (`src/components/profile/profile-overview-card.tsx`):
  - Initials-only avatar placeholder (`getUserInitials`). No avatar upload UI.
  - Displays full name (fallback `"Name not set"`), read-only email address, email verification badge, phone number (fallback `"Phone not provided"`), preferred language label, and account creation date.
- **`ProfileEditForm`** (`src/components/profile/profile-edit-form.tsx`):
  - Displays `email` as read-only & disabled with the notice `"Email address changes are not currently available."`
  - Editable fields: `fullName`, `phoneNumber`, `preferredLanguage` (`en`, `am`, `om`, `ti`), `bio` (with character counter).
  - **Save Changes** is disabled when unchanged (`buildChangedProfilePayload` returns `null`) or while saving.
  - **Cancel** restores the form to the latest loaded `profile` values and clears errors/banners.
- **`profile-validation.ts`** (`src/components/profile/profile-validation.ts`):
  - Client-side validation matching backend `UpdateProfileDto` limits (`fullName` 2–120 chars, `phoneNumber` `/^\+?[1-9]\d{6,14}$/`, `preferredLanguage` in `['en', 'am', 'om', 'ti']`, `bio` <= 500 chars).

---

## 3. API Integration

Uses `usersClient` (`src/lib/api/users-client.ts`) built on `authenticatedRequest`:
- `GET /api/v1/users/me` → loads `UserProfile` on mount.
- `PATCH /api/v1/users/me` → submits only changed fields (`UpdateProfileDto`), updates `ProfilePage` state with the returned `UserProfile`, and surfaces `400` field errors or network errors gracefully.

---

## 4. Security & State Handling

- Reuses `AuthProvider` and in-memory `tokenManager` (no tokens in `localStorage`/`sessionStorage`).
- Never accepts a target `userId` from URL or client state.
- Exposes no system roles, organization roles, permissions, password hashes, or session internals.
