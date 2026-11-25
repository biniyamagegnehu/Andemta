# Phase 4.2 Security Report — Permissions Catalog and Role-Permission Management

**Project**: Andemta — Ethiopian Consumer Research Marketplace  
**Phase**: 4.2  
**Date**: 2026-11-25  
**Status**: Complete ✅

---

## 1. Executive Summary

Phase 4.2 establishes the application-layer permission catalog and role-permission assignment system on top of the Phase 4.1 RBAC database foundation. It delivers a centralized, strongly typed permission catalog, an idempotent synchronization service, and comprehensive test coverage — without introducing any HTTP endpoints, JWT changes, or authorization guards (those are Phase 4.3).

---

## 2. Scope

### In scope
- Strongly typed `PERMISSION` constant catalog (36 codes, `as const`)
- `PermissionCode` union type derived from the constant
- `BUILT_IN_ROLE_PERMISSION_MAPPINGS` typed mapping (6 built-in roles)
- `RolePermissionService` with 8 query/validation/sync methods
- `RbacModule` registered in `AppModule`
- 25 unit tests, 20 integration tests
- Architecture and security documentation

### Out of scope (Phase 4.3+)
- Authorization guards, decorators, interceptors
- User or organization role assignment APIs
- JWT claim modifications
- Frontend changes

---

## 3. Files Created

| File | Purpose |
|---|---|
| `apps/api/src/modules/rbac/constants/permissions.ts` | Centralized typed permission catalog |
| `apps/api/src/modules/rbac/constants/role-permissions.ts` | Built-in role-permission mapping constants |
| `apps/api/src/modules/rbac/interfaces/rbac.interfaces.ts` | DTOs: `RoleDto`, `PermissionDto`, `RoleWithPermissionsDto`, `SyncSummary` |
| `apps/api/src/modules/rbac/services/role-permission.service.ts` | `RolePermissionService` |
| `apps/api/src/modules/rbac/rbac.module.ts` | NestJS module declaration |
| `apps/api/src/modules/rbac/index.ts` | Public barrel export |
| `apps/api/src/modules/rbac/services/role-permission.service.spec.ts` | 25 unit tests |
| `apps/api/test/rbac-permissions.e2e-spec.ts` | 20 integration tests |
| `docs/architecture/rbac-permissions-and-role-mapping.md` | Permission catalog reference |
| `docs/security/phase-4.2-permissions-and-role-management-report.md` | This report |

### Files Modified

| File | Change |
|---|---|
| `apps/api/src/app.module.ts` | Added `RbacModule` to imports array |

---

## 4. Permission Catalog Design

### 4.1 Catalog Size and Coverage

36 initial permissions covering 8 resource domains:

| Domain | Codes |
|---|---|
| Platform & Users | 5 |
| Organization | 4 |
| Organization Membership | 4 |
| Research | 5 |
| Survey | 6 |
| Participants | 2 |
| Product Testing | 5 |
| Reports | 2 |
| Rewards | 3 |

### 4.2 Naming Convention

`resource[.sub_resource].action` — underscores within resource names, dots as separators.  
Example: `organization.members.invite`, `product_testing.create`.

This matches the Phase 4.1 database seed convention exactly, ensuring zero code-database discrepancy.

### 4.3 Type Safety

All permission codes are captured in a TypeScript `as const` object, producing the `PermissionCode` union type. This means:
- Misspelled permission codes produce a compile-time error.
- Exhaustive checks in service methods are possible.
- IDE autocomplete surfaces all valid codes.

---

## 5. Role-Permission Assignments

### 5.1 Principle of Least Privilege

Each role receives only the permissions it needs:

| Role | Total Permissions | Philosophy |
|---|---|---|
| SYSTEM:PARTICIPANT | 3 | Participant activities only |
| SYSTEM:ADMIN | 10 | Platform oversight; no org authority |
| ORGANIZATION:OWNER | 24 | Full org authority; no platform admin |
| ORGANIZATION:ADMIN | 22 | Full org operations; no delete, no billing |
| ORGANIZATION:RESEARCHER | 16 | Research lifecycle; no member management |
| ORGANIZATION:VIEWER | 6 | Read-only across all org resources |

### 5.2 Scope Purity

- System roles (`SYSTEM:*`) have no organization-only permissions.
- Organization roles (`ORGANIZATION:*`) have no platform administration permissions.
- `validateScopeCompatibility()` enforces this at the service layer (pre-Phase 4.3 guard enforcement).

### 5.3 Key Security Boundaries

| Boundary | Enforcement |
|---|---|
| `organization.delete` restricted to OWNER | ADMIN, RESEARCHER, VIEWER cannot delete |
| `organization.billing.manage` restricted to OWNER | ADMIN and below cannot touch billing |
| Researcher cannot delete research or surveys | Only OWNER and ADMIN can |
| Researcher cannot invite or modify members | Member management is OWNER/ADMIN only |
| VIEWER has zero write permissions | All 6 viewer codes end in `.read` |
| PARTICIPANT has zero management permissions | Only `respond`, `participate`, `claim` |
| Platform ADMIN cannot delete organizations | Org deletion is strictly an org-scope operation |

---

## 6. RolePermissionService

### 6.1 Design

- Injected: `PrismaService` only. No dependency on `RedisService`, `AuthModule`, or `AppModule`.
- All query methods are read-safe and idempotent.
- `syncBuiltInRolePermissions()` is additive (upsert only — never deletes).

### 6.2 Idempotent Sync

The sync method:
1. Pre-loads all roles and permissions into in-memory maps (single query each).
2. For each role key in `BUILT_IN_ROLE_PERMISSION_MAPPINGS`, checks whether the `RolePermission` record exists.
3. Creates the record if absent; skips if present.
4. Returns a `SyncSummary` with counts and any missing role/permission warnings.

Running sync twice with no data changes yields `created: 0, skipped: N`.

### 6.3 Error Handling

| Scenario | Behaviour |
|---|---|
| Role not found in DB | Logged as warning; added to `missingRoles`; continues |
| Permission not found in DB | Logged as warning; added to `missingPermissions`; continues |
| Scope mismatch | Throws `BadRequestException` with descriptive message |
| Role not found in DB (orThrow variant) | Throws `NotFoundException` |

---

## 7. Test Coverage

### Unit Tests (`role-permission.service.spec.ts`) — 25/25 passing

| Group | Tests |
|---|---|
| `getRoleByScope` | Returns role, returns null |
| `getRoleByScopeOrThrow` | Throws NotFoundException, returns role |
| `getAllPermissions` | Returns active catalog |
| `getPermissionByCode` | Returns permission, returns null |
| `getPermissionsForRole` | Returns mapped permissions, returns empty |
| `roleHasPermission` | True, false |
| `validateScopeCompatibility` | Throws on mismatch, passes on match |
| `syncBuiltInRolePermissions` | Create+skip, missing roles, idempotent |
| Mapping constant assertions | VIEWER, PARTICIPANT, RESEARCHER, OWNER, ADMIN, all 6 keys |

### Integration Tests (`rbac-permissions.e2e-spec.ts`) — 20/20 passing

Tests run against real PostgreSQL. `AppModule` and `RedisModule` are NOT loaded (isolated `AppConfigModule + DatabaseModule + RbacModule`) to avoid ECONNREFUSED when Redis is not running.

| Test | Verifies |
|---|---|
| Catalog in DB | 30+ active permissions present |
| All 6 roles in DB | Built-in seed applied |
| `getRoleByScope` correct data | Scope, code, isBuiltIn, isActive |
| Non-existent role | Returns null |
| PARTICIPANT permissions | Exactly 3 codes, no management |
| VIEWER permissions | All `.read` only |
| `roleHasPermission` true | OWNER → `organization.delete` |
| `roleHasPermission` false | PARTICIPANT → `platform.admin` |
| `getAllPermissions` | 30+ active, all `isActive: true` |
| `getPermissionByCode` known | Returns DTO |
| `getPermissionByCode` unknown | Returns null |
| Scope mismatch | `BadRequestException` |
| Scope match | No throw |
| Idempotent sync | Second run: `created=0`, `skipped=N` |
| RESEARCHER no `org.delete` | `roleHasPermission` → false |
| RESEARCHER no `org.members.invite` | `roleHasPermission` → false |
| OWNER has `org.delete` | `roleHasPermission` → true |
| ADMIN has `platform.admin` | `roleHasPermission` → true |
| VIEWER mapping read-only | Constant cross-check |
| User + Session tables intact | Phase 3 auth unaffected |

### Full API Unit Suite — 273/273 passing (34 suites)

Previous baseline was 248 tests / 33 suites. Phase 4.2 added 25 tests / 1 new suite with no regressions.

### TypeScript compile — 0 errors

---

## 8. Existing Functionality Preservation

- All Phase 3 authentication tests continue to pass (248 original tests).
- `AppModule` changes are additive only (`RbacModule` import added).
- No Prisma schema changes in Phase 4.2 (schema was finalized in Phase 4.1).
- No destructive database operations.
- No JWT payload or token behavior changes.
- No API endpoint changes.

---

## 9. Known Limitations and Deferred Items

| Item | Reason Deferred |
|---|---|
| `@RequirePermission()` guard/decorator | Phase 4.3 |
| REST endpoints for role queries | Phase 4.3 |
| User role assignment APIs | Phase 4.3 |
| Organization membership APIs | Phase 4.3 |
| `payments.*` permissions | Pending payment module design |
| Row-level (resource-instance) permissions | Future architecture decision |

---

## 10. Decisions and Conventions

| Decision | Rationale |
|---|---|
| `as const` catalog over `enum` | Enables string literal types, better interop with Prisma string codes |
| Mapping key format `${RoleScope}:${code}` | Matches Phase 4.1 seed pattern; avoids ambiguity between SYSTEM:ADMIN and ORGANIZATION:ADMIN |
| Idempotent sync, never delete | Custom role-permission additions by future admins must be preserved |
| Isolated test module (no AppModule) | Redis may be unavailable; avoids `ECONNREFUSED` test failures |
| Underscore in `product_testing.*` | Consistent with Phase 4.1 DB records; hyphen spec variant was rejected |
| `description: string | null` mapper coalesces to `''` | Prisma schema allows nullable description; DTOs expose `string` |
