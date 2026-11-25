# Phase 4.4 Security Report — Organization and Membership Authorization

**Project**: Andemta — Ethiopian Consumer Research Marketplace  
**Phase**: 4.4  
**Date**: 2026-11-25  
**Status**: Complete — **PASS WITH LIMITATIONS**

---

## 1. Existing Implementation Inspected

- `apps/api/prisma/schema.prisma` (`Organization`, `OrganizationMembership`, `Role`, `Permission`, `RolePermission`, `UserSystemRole`, `OrganizationStatus`, `MembershipStatus`)
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` (`JwtAuthGuard`)
- `apps/api/src/modules/auth/decorators/current-user.decorator.ts` (`CurrentUser`)
- `apps/api/src/modules/rbac/guards/permissions.guard.ts` (`PermissionsGuard`)
- `apps/api/src/modules/rbac/services/role-permission.service.ts` (`RolePermissionService`)
- `apps/api/src/modules/rbac/interfaces/rbac.interfaces.ts`
- `apps/api/src/modules/rbac/rbac.module.ts` & `apps/api/src/app.module.ts`

---

## 2. Files Created and Modified

### Files Created
- `apps/api/src/modules/rbac/services/organization-authorization.service.ts` — `OrganizationAuthorizationService` & `ORGANIZATION_ID_UUID_REGEX`
- `apps/api/src/modules/rbac/services/organization-authorization.service.spec.ts` — Unit tests for organization & membership validation
- `apps/api/src/modules/rbac/guards/organization-auth.guard.ts` — `OrganizationAuthGuard`
- `apps/api/src/modules/rbac/guards/organization-auth.guard.spec.ts` — Unit tests for `OrganizationAuthGuard`
- `apps/api/src/modules/rbac/decorators/current-organization.decorator.ts` — `@CurrentOrganization()` parameter decorator
- `apps/api/src/modules/rbac/decorators/current-organization.decorator.spec.ts` — Unit tests for `@CurrentOrganization()`
- `apps/api/test/rbac-organization-authorization.e2e-spec.ts` — E2E organization context, membership, and cross-organization isolation tests
- `docs/architecture/organization-and-membership-authorization.md` — Architecture documentation
- `docs/security/phase-4.4-organization-membership-authorization-report.md` — This security report

### Files Modified
- `apps/api/src/modules/rbac/interfaces/rbac.interfaces.ts` — Added `OrganizationContext` interface
- `apps/api/src/modules/rbac/guards/permissions.guard.ts` — Integrated `OrganizationAuthorizationService` and `request.organizationContext` reuse
- `apps/api/src/modules/rbac/guards/permissions.guard.spec.ts` — Updated and expanded unit tests for `OrganizationAuthorizationService` integration
- `apps/api/src/modules/rbac/rbac.module.ts` — Registered and exported `OrganizationAuthorizationService` and `OrganizationAuthGuard`
- `apps/api/src/modules/rbac/index.ts` — Exported new service, guard, decorator, and `OrganizationContext` type

---

## 3. Organization Context Design

- Organization ID is resolved strictly from trusted route parameters (`:organizationId` or `:orgId`) via `OrganizationAuthorizationService.extractOrganizationIdFromParams()`.
- Request bodies and untrusted client headers are never used for organization context resolution.
- UUID format is validated before querying PostgreSQL (`400 Bad Request` on malformed IDs).
- Validated context is attached to `request.organizationContext` as `OrganizationContext` (`organizationId`, `organizationType`, `userId`, `membershipId`, `roleCode`, `permissions`).
- `@CurrentOrganization()` reads only `request.organizationContext` and fails closed (`500 Internal Server Error`) if missing.

---

## 4. Membership Authorization Behavior

- `validateOrganizationAccess(userId, organizationId)` executes a single indexed Prisma query joining `Organization` → `OrganizationMembership` (filtered by `userId`) → `Role` → `RolePermission` → `Permission`.
- Denies access with:
  - `404 Not Found` if organization does not exist.
  - `403 Forbidden` if organization status is `SUSPENDED` or `INACTIVE`.
  - `403 Forbidden` if user has no membership in the organization.
  - `403 Forbidden` if membership status is `SUSPENDED`, `INVITED`, or `INACTIVE`.
  - `403 Forbidden` if role is inactive or not `RoleScope.ORGANIZATION`.
- Only `isActive = true` permissions are included.

---

## 5. Guard Execution Order

1. **`JwtAuthGuard`** validates Bearer JWT and attaches `request.user` (`401` on failure).
2. **`OrganizationAuthGuard`** (or `OrganizationAuthorizationService` via `PermissionsGuard`) validates `:organizationId` and membership, attaching `request.organizationContext` (`400` / `404` / `403`).
3. **`PermissionsGuard`** evaluates `@RequirePermissions(...)` with **AND** semantics against `request.organizationContext.permissions` for `ORGANIZATION` permissions and `UserSystemRole` for `SYSTEM` permissions (`403` on missing permission).

Both `OrganizationAuthGuard` and `PermissionsGuard` avoid duplicate DB queries when `request.organizationContext` is already populated for the same `(userId, organizationId)`.

---

## 6. Permission Integration

- `PermissionsGuard` splits required permissions by `getPermissionScope(code)` into `SYSTEM` and `ORGANIZATION` sets.
- `ORGANIZATION` permissions always require a validated `OrganizationContext`; system roles (`SYSTEM:ADMIN`, `SYSTEM:PARTICIPANT`) never satisfy organization-scoped permissions without an active membership.
- `SYSTEM` permissions are checked strictly against `UserSystemRole`; organization roles (`ORGANIZATION:ADMIN`, `ORGANIZATION:OWNER`) never satisfy system-scoped permissions.

---

## 7. Cross-Organization Security Results

Verified in `apps/api/test/rbac-organization-authorization.e2e-spec.ts`:
- A user who is `RESEARCHER` in Org A and `VIEWER` in Org B can create research in Org A (`201`) but is denied in Org B (`403`).
- Sending Org A's ID in the request body of a `POST` to Org B's route still fails with `403` (body cannot override route context).
- `ORGANIZATION:ADMIN` is denied access to `PLATFORM_ADMIN` routes (`403`).
- `SYSTEM:ADMIN` without membership in Org A is denied access to Org A's routes (`403`).
- `SUSPENDED`, `INVITED`, and `INACTIVE` memberships, as well as `SUSPENDED` organizations, are denied (`403`).

---

## 8. Tests Actually Executed and Results

| Check | Command | Result |
|---|---|---|
| Prisma validation | `npx prisma validate` | **Passed** |
| TypeScript check | `npx tsc --noEmit` | **Passed** (0 errors) |
| Full API unit test suite | `npx jest --runInBand --forceExit` | **Passed** (39/39 suites, 316/316 tests) |
| RBAC E2E suites (`rbac-authorization` + `rbac-organization-authorization`) | `npx jest --config ./test/jest-e2e.json --testPathPattern="rbac-authorization\|rbac-organization-authorization" --runInBand --forceExit` | **Passed** (2/2 suites, 34/34 tests) |
| ESLint | `npm run lint` | **Passed** (0 errors, 11 pre-existing warnings) |
| NestJS build | `npm run build` | **Passed** |

Note: E2E suites run against real PostgreSQL with `RedisService` mocked in the isolated Nest testing modules because Redis is offline in the local environment.

---

## 9. Known Limitations

1. **No production organization or resource endpoints yet**: Organization CRUD, membership workflows, and resource-derived organization context (e.g., resolving `organizationId` from a `:researchId` record) are deferred to Phase 4.5+ / business modules.
2. **Route parameter dependency**: Organization-scoped enforcement currently expects `:organizationId` or `:orgId` in route parameters.

---

## 10. Manual Steps Required

None. No Prisma schema migrations or environment variable changes were required for Phase 4.4.

---

## 11. Final Classification

**PASS WITH LIMITATIONS** — Organization context resolution, membership validation, `OrganizationAuthGuard`, `@CurrentOrganization()`, `PermissionsGuard` integration, and cross-organization isolation are implemented and verified across 39 unit suites (316 tests) and 2 RBAC E2E suites (34 tests); production organization/resource endpoints remain deferred to subsequent phases.
