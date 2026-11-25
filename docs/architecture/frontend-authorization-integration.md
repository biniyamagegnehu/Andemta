# Frontend Authorization Integration

**Phase 4.7 — Andemta Ethiopian Consumer Research Marketplace**

This document defines how the Next.js frontend integrates with the NestJS RBAC and organization authorization system without duplicating authorization rules or hardcoding role-to-permission mappings.

---

## 1. Authorization Data Flow

1. User authenticates via `AuthProvider` (Phase 3.10 in-memory `tokenManager` + HttpOnly refresh cookie).
2. `OrganizationProvider` fetches the user's active organizations from `GET /api/v1/organizations` and maintains `selectedOrganizationId`.
3. `AuthorizationProvider` fetches:
   - **System authorization**: `GET /api/v1/authorization/system` → `{ userId, systemRoles, permissions }` (SYSTEM-scoped permissions only).
   - **Organization authorization**: `GET /api/v1/authorization/organizations/:organizationId` → `{ organizationId, organizationType, roleCode, membershipStatus, permissions }` (ORGANIZATION-scoped permissions for `selectedOrganizationId`).
4. Both scopes are stored **strictly in React state** (never `localStorage` or `sessionStorage`), kept in separate fields, and cleared immediately on logout or organization switch.

---

## 2. Backend Permission Context Endpoints

Added in `apps/api/src/modules/rbac/controllers/authorization-context.controller.ts`:

- **`GET /api/v1/authorization/system`** (`@UseGuards(JwtAuthGuard)`):
  - Calls `RolePermissionService.getUserSystemAuthorizationContext(user.id)`.
  - Returns only active `SYSTEM` roles and active `SYSTEM` permissions.
- **`GET /api/v1/authorization/organizations/:organizationId`** (`@UseGuards(JwtAuthGuard, OrganizationAuthGuard)`):
  - Enforces Phase 4.4 `OrganizationAuthGuard` (`400` malformed UUID, `401` unauthenticated, `403` non-member/inactive/suspended, `404` missing org).
  - Returns only the authenticated user's `roleCode` and active `ORGANIZATION` permissions.

---

## 3. `AuthorizationProvider` & `useAuthorization()`

Defined in `apps/web/src/context/authorization-context.tsx`:

- Exposes:
  - `systemRoles`, `systemPermissions`
  - `organizationPermissions`, `organizationRole`, `organizationId`
  - `isSystemLoading`, `isOrganizationLoading`, `isLoading`, `error`
  - `hasSystemPermission(permission)`, `hasAnySystemPermission(permissions)`, `hasAllSystemPermissions(permissions)`
  - `hasOrganizationPermission(permission)`, `hasAnyOrganizationPermission(permissions)`, `hasAllOrganizationPermissions(permissions)`
  - `refreshAuthorization()`
- **Stale response protection**: Monotonic sequence counters (`systemSeqRef`, `orgSeqRef`) discard out-of-order responses.
- **Immediate clearing on org switch**: Switching `selectedOrganizationId` clears `organizationPermissions`, `organizationRole`, and `organizationId` synchronously before the next request resolves.
- **Fail-closed**: Loading or error states always return `false` for all permission checks.

---

## 4. Permission Helpers & Route Protection

- **`PermissionGate`**, **`AnyPermissionGate`**, **`AllPermissionsGate`** (`src/components/auth/permission-gate.tsx`):
  - Require explicit `scope: 'system' | 'organization'` so scopes are never confused.
- **`RoutePermissionGuard`** (`src/components/auth/route-permission-guard.tsx`):
  - Waits for `isInitialized`, `isAuthenticated`, and authorization loading before deciding access.
  - Renders `UnauthorizedState` (403-style UI) when permissions or organization context are missing.
- **Permission-Aware Navigation** (`src/config/navigation.ts`):
  - `filterNavigationItems()` filters `AUTHENTICATED_NAV_ITEMS` across `AppSidebar`, `MobileNavigation`, and `/dashboard` based on effective `SYSTEM` and `ORGANIZATION` permissions.

---

## 5. Limitations

- Frontend checks are for presentation and navigation only; NestJS guards (`JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard`) remain authoritative.
- Frontend tests run in Jest `node` environment matching `apps/web/jest.config.js` (no browser DOM/Playwright E2E tests in this phase).
