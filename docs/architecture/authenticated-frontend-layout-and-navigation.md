# Authenticated Frontend Layout and Navigation

**Phase 4.6 — Andemta Ethiopian Consumer Research Marketplace**

This document describes the authenticated Next.js App Router shell, centralized navigation, authentication integration, responsive behavior, and organization selector foundation.

---

## 1. Route Structure

Authenticated routes live inside the Next.js App Router route group `apps/web/src/app/(authenticated)/`, which shares `(authenticated)/layout.tsx` without adding an extra URL segment:

| Route | File | Status |
|---|---|---|
| `/dashboard` | `src/app/(authenticated)/dashboard/page.tsx` | Implemented (user welcome + real org summary + section links) |
| `/organizations` | `src/app/(authenticated)/organizations/page.tsx` | Implemented (read-only list of active user organizations) |
| `/research` | `src/app/(authenticated)/research/page.tsx` | Placeholder |
| `/surveys` | `src/app/(authenticated)/surveys/page.tsx` | Placeholder |
| `/product-testing` | `src/app/(authenticated)/product-testing/page.tsx` | Placeholder |
| `/participants` | `src/app/(authenticated)/participants/page.tsx` | Placeholder |
| `/reports` | `src/app/(authenticated)/reports/page.tsx` | Placeholder |

Public routes (`/`, `/login`, `/register`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/auth/google/callback`) remain outside `(authenticated)` and are unaffected.

---

## 2. Authenticated Layout Architecture

- **`AuthenticatedLayout`** (`src/components/layout/authenticated-layout.tsx`):
  - Consumes `useAuth()` from the Phase 3.10 `AuthProvider`.
  - Waits for `isInitialized === true` before deciding on redirects so initial HttpOnly refresh restoration never causes premature redirects.
  - Redirects unauthenticated users to `/login?returnUrl=<safePath>` using `getSafeRedirectUrl`.
  - Wraps authenticated children in `OrganizationProvider` and renders `AppSidebar`, `MobileNavigation`, `AppHeader`, and `<main>`.
- **`AppSidebar`** (`src/components/layout/app-sidebar.tsx`):
  - Persistent on desktop (`lg+`), collapsible between `w-64` and `w-20`.
  - Reads `AUTHENTICATED_NAV_ITEMS` from `src/config/navigation.ts`.
- **`MobileNavigation`** (`src/components/layout/mobile-navigation.tsx`):
  - Slide-over drawer for `< lg` viewports with backdrop, `Escape` key close, and `min-h-[44px]` touch targets.
- **`AppHeader`** (`src/components/layout/app-header.tsx`):
  - Mobile menu toggle button, resolved page title (`getAuthenticatedPageTitle`), `OrganizationSelector`, and `UserAccountMenu`.

---

## 3. Organization Selector Foundation

- **`organizationsClient`** (`src/lib/api/organizations-client.ts`): Calls `GET /api/v1/organizations` via `authenticatedRequest` (reusing the in-memory `tokenManager` Bearer token and single-flight 401 refresh).
- **`OrganizationProvider` & `useOrganizations`** (`src/context/organization-context.tsx`):
  - Loads the authenticated user's active organizations on mount.
  - Validates any selected organization ID against the returned list via `resolveValidOrganizationId()`.
  - Prevents selecting any organization not present in the user's returned list.
  - Clears selection on logout or unauthenticated state.
  - Stores selection only in React state (no `localStorage`/`sessionStorage`).
- **`OrganizationSelector`** (`src/components/layout/organization-selector.tsx`):
  - Handles loading, error (with retry), empty ("No organizations"), and selection states, displaying organization name and type (`Business`, `University`, `Other`).
  - Serves strictly as a UI context selector, **not** an authorization mechanism. Backend guards remain authoritative.

---

## 4. User Account Menu & Logout Integration

- **`UserAccountMenu`** (`src/components/layout/user-account-menu.tsx`):
  - Displays safe user initials (`getUserInitials`), email address, and user ID.
  - Invokes `logout()` from `useAuth()` (which calls `POST /api/v1/auth/logout` and clears in-memory `tokenManager` state) and redirects to `/login`.
  - Never displays access tokens, refresh cookies, or session secrets.

---

## 5. Known Limitations

- Permission-aware / role-based navigation filtering is deferred to a later phase.
- Organization creation/editing forms, member management UI, and admin user management screens are deferred.
- Research, Surveys, Product Testing, Participants, and Reports pages are lightweight placeholders until their respective modules are implemented.
