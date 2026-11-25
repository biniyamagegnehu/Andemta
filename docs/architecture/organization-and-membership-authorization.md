# Organization and Membership Authorization

**Phase 4.4 — Andemta Ethiopian Consumer Research Marketplace**

This document defines secure organization context resolution, organization membership validation, guard execution order, and cross-organization isolation in the Andemta NestJS backend.

---

## 1. Organization Context Resolution

Organization-scoped endpoints identify the target organization strictly from trusted server-side route parameters:

- `:organizationId` (preferred, e.g., `/api/v1/organizations/:organizationId/research`)
- `:orgId` (supported alias)

### Security Rules
- **UUID format validation**: All organization IDs are validated against UUID v4/standard format (`ORGANIZATION_ID_UUID_REGEX`) before querying PostgreSQL (`400 Bad Request` on malformed IDs).
- **Untrusted inputs ignored**: Client-supplied `organizationId` values in request bodies or custom headers are never used for authorization context resolution.
- **Fail closed**: Missing organization context on an organization-scoped route results in `403 Forbidden`.

---

## 2. Membership Validation (`OrganizationAuthorizationService`)

Defined in `apps/api/src/modules/rbac/services/organization-authorization.service.ts`.

`validateOrganizationAccess(userId, organizationId)` performs **one single indexed Prisma query** (no N+1 lookups) on `Organization` + `OrganizationMembership` + `Role` + `RolePermission` + `Permission` and enforces:

1. **Organization exists**: If absent → `404 Not Found`.
2. **Organization status**: Must be `OrganizationStatus.ACTIVE` (`SUSPENDED` / `INACTIVE` → `403 Forbidden`).
3. **Membership exists**: User must have an `OrganizationMembership` record for that specific `organizationId` (absent → `403 Forbidden`).
4. **Membership status**: Must be `MembershipStatus.ACTIVE` (`INVITED`, `SUSPENDED`, `INACTIVE` → `403 Forbidden`).
5. **Organization role scope & status**: `roleScope === RoleScope.ORGANIZATION`, `role.scope === RoleScope.ORGANIZATION`, and `role.isActive === true`.
6. **Active permissions**: Only permissions with `permission.isActive === true` are collected into the context.

---

## 3. Request Context Structure (`OrganizationContext`)

The validated context attached to `request.organizationContext` contains only the minimal fields needed by downstream controllers and services:

```typescript
export interface OrganizationContext {
  organizationId: string;
  organizationType: OrganizationType;
  userId: string;
  membershipId: string;
  roleCode: string;
  permissions: PermissionCode[];
}
```

Internal Prisma records, other users' memberships, and database metadata are never attached or exposed.

---

## 4. Guard Execution Order

Execution order for organization-scoped routes:

1. **`JwtAuthGuard`** — Validates Bearer JWT via `JwtStrategy` and populates `request.user` (`401` on failure).
2. **`OrganizationAuthGuard` / `OrganizationAuthorizationService`** — Resolves `:organizationId`, validates organization & active membership, and attaches `request.organizationContext` (`400` / `404` / `403`).
3. **`PermissionsGuard`** — Evaluates `@RequirePermissions(...)` with **AND** semantics against `request.organizationContext.permissions` (for `ORGANIZATION` permissions) and `UserSystemRole` (for `SYSTEM` permissions).

If `PermissionsGuard` runs as global `APP_GUARD` on a `@RequirePermissions(...)` organization route where `OrganizationAuthGuard` has not yet run, `PermissionsGuard` invokes `JwtAuthGuard` and `OrganizationAuthorizationService` in sequence and attaches `request.organizationContext`. When `OrganizationAuthGuard` runs afterward (or beforehand), it reuses the validated `request.organizationContext` for the same `(userId, organizationId)` without duplicating database queries.

---

## 5. `@CurrentOrganization()` Decorator

Defined in `apps/api/src/modules/rbac/decorators/current-organization.decorator.ts`.

```typescript
@UseGuards(JwtAuthGuard, OrganizationAuthGuard)
@RequirePermissions(PERMISSION.RESEARCH_CREATE)
@Post(':organizationId/research')
createResearch(@CurrentOrganization() org: OrganizationContext) {
  return { organizationId: org.organizationId, role: org.roleCode };
}
```

- Reads **only** `request.organizationContext` already validated by the guards.
- Supports field extraction (`@CurrentOrganization('organizationId')`).
- Fails closed (`500 Internal Server Error`) if used on a route without guard-validated `organizationContext`.

---

## 6. Cross-Organization Isolation

- A user may belong to multiple organizations with different roles (e.g., `RESEARCHER` in Organization A and `VIEWER` in Organization B).
- Permissions are loaded strictly from the membership row matching `(userId, organizationId)`.
- A `RESEARCHER` in Organization A cannot create research in Organization B where they are `VIEWER`.
- A `SYSTEM:ADMIN` without membership in Organization A cannot access Organization A's routes.
- An `ORGANIZATION:ADMIN` cannot satisfy `SYSTEM` permissions such as `platform.admin`.

---

## 7. HTTP Error Behavior

| Condition | HTTP Status |
|---|---|
| Missing or invalid JWT | `401 Unauthorized` |
| Malformed `:organizationId` (non-UUID) | `400 Bad Request` |
| Organization does not exist | `404 Not Found` |
| Inactive or suspended organization | `403 Forbidden` |
| No membership in target organization | `403 Forbidden` |
| `INVITED`, `SUSPENDED`, or `INACTIVE` membership | `403 Forbidden` |
| Missing organization permission | `403 Forbidden` |
| Missing organization route context | `403 Forbidden` |
| Database error | `500 Internal Server Error` (no DB details leaked) |

---

## 8. Deferred Resource-Level Authorization

The following remain deferred to later phases:
- Organization CRUD and membership invitation/management APIs
- Resource-level ownership checks (e.g., resolving `organizationId` from a `:researchId` or `:surveyId` record)
- Custom organization roles and Redis authorization caching
