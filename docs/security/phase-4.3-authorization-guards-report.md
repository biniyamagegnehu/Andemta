# Phase 4.3 Security Report — NestJS Authorization Guards and Permission Decorators

**Project**: Andemta — Ethiopian Consumer Research Marketplace  
**Phase**: 4.3  
**Date**: 2026-11-25  
**Status**: Complete — **PASS WITH LIMITATIONS**

---

## 1. Existing Implementation Inspected

- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` (`JwtAuthGuard`)
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts` (`JwtStrategy`, `validate()`)
- `apps/api/src/modules/auth/decorators/current-user.decorator.ts` (`CurrentUser`)
- `apps/api/src/modules/auth/interfaces/authenticated-user.interface.ts` (`AuthenticatedUser`)
- `apps/api/src/modules/auth/auth.controller.ts` & `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/common/guards/base.guard.ts` & `apps/api/src/common/filters/all-exceptions.filter.ts`
- `apps/api/src/app.module.ts` & `apps/api/src/main.ts`
- `apps/api/prisma/schema.prisma` (`User`, `Role`, `Permission`, `RolePermission`, `UserSystemRole`, `Organization`, `OrganizationMembership`)
- `apps/api/src/modules/rbac/services/role-permission.service.ts` & `apps/api/src/modules/rbac/constants/permissions.ts`

---

## 2. Files Created and Modified

### Files Created
- `apps/api/src/modules/rbac/decorators/require-permissions.decorator.ts` — `@RequirePermissions` decorator and `REQUIRED_PERMISSIONS_KEY`
- `apps/api/src/modules/rbac/decorators/require-permissions.decorator.spec.ts` — 5 decorator unit tests
- `apps/api/src/modules/rbac/guards/permissions.guard.ts` — `PermissionsGuard`
- `apps/api/src/modules/rbac/guards/permissions.guard.spec.ts` — 11 guard unit tests
- `apps/api/test/rbac-authorization.e2e-spec.ts` — 19 end-to-end authorization & scope tests
- `docs/architecture/rbac-authorization-guards.md` — Authorization architecture & usage guide
- `docs/security/phase-4.3-authorization-guards-report.md` — This security report

### Files Modified
- `apps/api/src/modules/rbac/constants/permissions.ts` — Added `PERMISSION_SCOPES` (`Record<PermissionCode, RoleScope>`) and `getPermissionScope()`
- `apps/api/src/modules/rbac/services/role-permission.service.ts` — Added `getUserSystemPermissions()`, `getUserOrganizationPermissions()`, and `userHasPermissions()`
- `apps/api/src/modules/rbac/services/role-permission.service.spec.ts` — Added 6 runtime authorization unit tests
- `apps/api/src/modules/rbac/rbac.module.ts` — Imported `AuthModule`, provided and exported `PermissionsGuard`
- `apps/api/src/modules/rbac/index.ts` — Exported `PermissionsGuard`, `RequirePermissions`, `REQUIRED_PERMISSIONS_KEY`, `PERMISSION_SCOPES`, and `getPermissionScope`
- `apps/api/src/app.module.ts` — Registered `PermissionsGuard` globally via `APP_GUARD`

---

## 3. Decorator Behavior

- `@RequirePermissions(...permissions: PermissionCode[])` stores deduplicated permission codes under `REQUIRED_PERMISSIONS_KEY = 'rbac:required_permissions'` via `SetMetadata`.
- Rejects empty definitions (`@RequirePermissions()`) and unrecognized permission codes at decoration time by throwing an `Error`.
- Enforces **AND** semantics when multiple permissions are declared.
- Handler-level metadata overrides controller-level metadata; handlers without metadata inherit controller-level metadata (`Reflector.getAllAndOverride`).

---

## 4. Guard Behavior

- **Pass-through when undeclared**: If neither handler nor controller has `@RequirePermissions`, `PermissionsGuard` returns `true`, preserving all public and `@UseGuards(JwtAuthGuard)`-only routes.
- **Fail-safe metadata validation**: Empty or invalid metadata arrays throw `500 InternalServerErrorException('Authorization configuration error')`.
- **Authentication delegation**: If `request.user` is absent, `PermissionsGuard` invokes `JwtAuthGuard.canActivate(context)` rather than duplicating JWT logic, returning `401 Unauthorized` on missing/expired/invalid tokens.
- **Authorization check**: Evaluates required permissions against PostgreSQL via `RolePermissionService.userHasPermissions()`, throwing `403 Forbidden` when any required permission or required organization context is missing.
- **No information leakage**: Never returns user permission lists, role assignments, DB error strings, or JWT contents in responses. Database errors fail closed with `500 InternalServerErrorException('Unable to verify authorization')`.

---

## 5. Authentication Execution Order

1. `AppThrottlerGuard` (global `APP_GUARD`) executes rate limiting.
2. Any route-level `@UseGuards(JwtAuthGuard)` executes JWT validation and populates `request.user`.
3. `PermissionsGuard` (global `APP_GUARD`) checks `@RequirePermissions` metadata. If metadata is present and `request.user` is not yet populated, it invokes `JwtAuthGuard` first, ensuring authentication always precedes authorization.

---

## 6. System and Organization Scope Handling

- Every `PermissionCode` is explicitly mapped to `RoleScope.SYSTEM` or `RoleScope.ORGANIZATION` in `PERMISSION_SCOPES`.
- **System permissions** are queried in a single Prisma query against `userSystemRoles` (`roleScope = SYSTEM`, `role.scope = SYSTEM`, `role.isActive = true`, `permission.isActive = true`).
- **Organization permissions** are queried in a single Prisma query against `organizationMembership` by `(userId, organizationId)` (`status = ACTIVE`, `organization.status = ACTIVE`, `roleScope = ORGANIZATION`, `role.scope = ORGANIZATION`, `role.isActive = true`, `permission.isActive = true`).
- `PermissionsGuard` extracts `organizationId` only from trusted UUID-validated route params (`request.params?.organizationId ?? request.params?.orgId`). Missing or invalid organization context denies organization-scoped permissions (`403 Forbidden`).

---

## 7. Tests Actually Executed and Results

| Check | Command | Result |
|---|---|---|
| TypeScript check | `npx tsc --noEmit` | **Passed** (0 errors) |
| Full API unit test suite | `npx jest --runInBand --forceExit` | **Passed** (36/36 suites, 295/295 tests) |
| Phase 4.3 E2E authorization suite | `npx jest --config ./test/jest-e2e.json --testPathPattern="rbac-authorization" --runInBand --forceExit` | **Passed** (1/1 suite, 19/19 tests) |
| ESLint | `npm run lint` | **Passed** (0 errors, 11 pre-existing warnings) |
| NestJS build | `npm run build` | **Passed** |

Note: `rbac-authorization.e2e-spec.ts` runs against real PostgreSQL with `RedisService` mocked in the isolated test module because Redis is not running in this local environment.

---

## 8. Known Limitations

1. **No production organization endpoints yet**: Organization CRUD, membership management, and resource-derived organization context (resolving `organizationId` from a `:researchId` or `:surveyId`) are deferred to Phase 4.4+. Organization-scoped enforcement currently requires `:organizationId` or `:orgId` as a route parameter.
2. **No Redis permission caching**: Deferred by specification; every permission-protected request performs 1–2 indexed PostgreSQL queries.

---

## 9. Manual Steps Required

None. No Prisma schema migrations or environment variable changes were required for Phase 4.3.

---

## 10. Final Classification

**PASS WITH LIMITATIONS** — Runtime decorator and guard enforcement, scope isolation, AND semantics, error masking, and regression compatibility are implemented and verified by unit and integration tests; organization-scoped enforcement on production business routes awaits Phase 4.4+ organization and resource endpoints.
