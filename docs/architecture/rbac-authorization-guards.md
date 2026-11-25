# RBAC Authorization Guards and Permission Decorators

**Phase 4.3 — Andemta Ethiopian Consumer Research Marketplace**

This document describes runtime permission-based authorization in the Andemta NestJS backend using `@RequirePermissions` and `PermissionsGuard`.

---

## 1. Overview

Phase 4.3 connects the Phase 3 JWT authentication layer (`JwtAuthGuard` / `JwtStrategy`) with the Phase 4.1–4.2 RBAC database foundation (`RolePermissionService`).

Key principles:
- **Zero trust in client claims**: Permissions are never read from JWT payloads or request headers/bodies. All authorization decisions are evaluated against active PostgreSQL records (`UserSystemRole`, `OrganizationMembership`, `Role`, `Permission`, `RolePermission`).
- **Strict scope isolation**: `SYSTEM` permissions and `ORGANIZATION` permissions are evaluated independently.
- **Backward compatibility**: Routes without `@RequirePermissions` are unaffected.

---

## 2. `@RequirePermissions` Decorator

Defined in `apps/api/src/modules/rbac/decorators/require-permissions.decorator.ts`.

### Usage

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermissions, PERMISSION } from '../modules/rbac';

@Controller('admin/metrics')
@RequirePermissions(PERMISSION.PLATFORM_METRICS_READ)
export class AdminMetricsController {
  @Get()
  getMetrics() {
    return { metrics: [] };
  }
}
```

### Multiple Permissions (AND Semantics)

When multiple permissions are passed, **AND semantics** apply: the authenticated user must hold **all** declared permissions.

```typescript
@RequirePermissions(PERMISSION.RESEARCH_CREATE, PERMISSION.REPORTS_EXPORT)
@Get('orgs/:organizationId/studies/export')
exportStudies(@Param('organizationId') organizationId: string) {
  return { organizationId };
}
```

### Validation & Metadata Key

- Centralized metadata key: `REQUIRED_PERMISSIONS_KEY = 'rbac:required_permissions'`.
- Empty `@RequirePermissions()` calls or unrecognized permission strings throw an `Error` at decoration time (fail-fast).
- Duplicate permissions in the same decorator are automatically deduplicated.

---

## 3. Controller-Level vs Handler-Level Metadata

`PermissionsGuard` resolves metadata using NestJS `Reflector.getAllAndOverride`:

```typescript
this.reflector.getAllAndOverride<PermissionCode[] | undefined>(
  REQUIRED_PERMISSIONS_KEY,
  [context.getHandler(), context.getClass()],
);
```

- **Handler overrides controller**: If a handler has `@RequirePermissions(...)`, it replaces any `@RequirePermissions(...)` on the controller class.
- **Controller inheritance**: If a handler has no `@RequirePermissions(...)`, it inherits the controller-level `@RequirePermissions(...)`.
- **No metadata**: If neither handler nor controller declares `@RequirePermissions`, `PermissionsGuard` returns `true` immediately.

---

## 4. Authentication & Authorization Execution Order

`PermissionsGuard` is registered globally via `APP_GUARD` in `AppModule` (after `AppThrottlerGuard`).

```
Incoming Request
  │
  ├─► AppThrottlerGuard (Rate limiting)
  │
  ├─► Route-level @UseGuards(JwtAuthGuard) (if declared)
  │     └─► Validates Bearer JWT via JwtStrategy → sets request.user or throws 401
  │
  └─► PermissionsGuard (Global APP_GUARD)
        ├─► No @RequirePermissions metadata → allow (backward-compatible)
        ├─► Invalid/empty metadata → 500 Internal Server Error (fail closed)
        ├─► request.user missing → invokes JwtAuthGuard.canActivate(context) → 401 if unauthenticated
        ├─► Queries RolePermissionService (PostgreSQL)
        └─► Missing permission or missing org context → 403 Forbidden
```

Because `PermissionsGuard` automatically invokes `JwtAuthGuard` when `request.user` is not yet set, developers do not need to duplicate `@UseGuards(JwtAuthGuard)` on `@RequirePermissions` routes, while routes using `@UseGuards(JwtAuthGuard)` alone (such as `GET /api/v1/auth/me`) continue to work unchanged.

---

## 5. System vs Organization Scope

Every `PermissionCode` is mapped to an explicit `RoleScope` in `PERMISSION_SCOPES` (`apps/api/src/modules/rbac/constants/permissions.ts`):

- **`RoleScope.SYSTEM`** (checked only against `UserSystemRole` where `role.isActive = true` and `role.scope = SYSTEM`):
  - `users.read`, `users.manage`, `platform.admin`, `platform.audit.read`, `platform.metrics.read`
  - `survey.respond`, `product_testing.participate`, `rewards.claim`
- **`RoleScope.ORGANIZATION`** (checked only against `OrganizationMembership` where `membership.status = ACTIVE`, `organization.status = ACTIVE`, `role.isActive = true`, and `role.scope = ORGANIZATION`):
  - `organization.*`, `organization.members.*`, `research.*`, `survey.*` (except `survey.respond`), `participants.*`, `product_testing.*` (except `product_testing.participate`), `reports.*`, `rewards.distribute`, `rewards.read`

Cross-scope guarantees:
- An `ORGANIZATION:ADMIN` cannot satisfy `SYSTEM` permissions such as `platform.admin`.
- A `SYSTEM:ADMIN` cannot satisfy `ORGANIZATION` permissions without an active `OrganizationMembership` in the target organization.
- A `SYSTEM:PARTICIPANT` cannot satisfy any `ORGANIZATION` permission.
- Membership in Organization A does not grant access to Organization B.

---

## 6. Organization Context Limitations

In Phase 4.3, `PermissionsGuard` resolves the target organization UUID strictly from trusted route parameters:
- `request.params?.organizationId`
- `request.params?.orgId`

If a route requires an organization-scoped permission and no valid UUID `organizationId` / `orgId` route parameter is present, `RolePermissionService.userHasPermissions` denies access (`403 Forbidden`) rather than falling back to system roles or trusting arbitrary client headers/body fields.

Organization creation, membership management APIs, and resource-derived organization context (e.g., resolving `organizationId` from a `:researchId` or `:surveyId` record) are **deferred to Phase 4.4+**.

---

## 7. HTTP Status Codes & Error Behavior

| Condition | HTTP Status | Response Behavior |
|---|---|---|
| Missing, expired, or invalid Bearer JWT | `401 Unauthorized` | Handled by `JwtAuthGuard` |
| Authenticated user lacks required permission(s) | `403 Forbidden` | Generic `"You do not have permission to perform this action"` |
| Organization permission requested without valid org context | `403 Forbidden` | Fails closed |
| Suspended/inactive membership, role, or organization | `403 Forbidden` | Fails closed |
| Empty or invalid permission metadata on route | `500 Internal Server Error` | Generic `"Authorization configuration error"` (masked in non-dev) |
| Database lookup failure | `500 Internal Server Error` | Generic `"Unable to verify authorization"` (no DB details leaked) |

---

## 8. Deferred Items (Phase 4.4+)

- Organization CRUD and membership management APIs
- User system-role and organization-role assignment endpoints
- Resource-level ownership checks (e.g., resolving `organizationId` from a research study or survey ID)
- Redis permission caching with explicit invalidation
