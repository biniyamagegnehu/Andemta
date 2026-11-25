# Organization, User, and Role Management APIs

**Phase 4.5 — Andemta Ethiopian Consumer Research Marketplace**

This document specifies the REST APIs, DTO validation rules, permission requirements, ownership invariants, and error contracts for organization management, organization membership management, and platform user/system-role administration.

---

## 1. Endpoints Overview

All endpoints use the global prefix `/api/v1` and return the standard `ApiResponse` envelope (`{ success, message, data, errors }`).

### Part 1 — Organization Management (`/api/v1/organizations`)

| Method | Path | Auth / Guards | Required Permission | Purpose |
|---|---|---|---|---|
| `POST` | `/api/v1/organizations` | `JwtAuthGuard` | Authenticated user | Create organization & assign creator `OWNER` atomically |
| `GET` | `/api/v1/organizations` | `JwtAuthGuard` | Authenticated user | List active organizations where user has active membership |
| `GET` | `/api/v1/organizations/:organizationId` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.read` | Get organization details |
| `PATCH` | `/api/v1/organizations/:organizationId` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.update` | Update permitted fields (`name`, `type`) |

Note: Organization deletion (`DELETE /api/v1/organizations/:organizationId`) is deferred until an approved retention/cascading-deletion policy is established for research studies, surveys, and reward records.

### Part 2 — Organization Membership Management (`/api/v1/organizations/:organizationId/members`)

| Method | Path | Auth / Guards | Required Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/api/v1/organizations/:organizationId/members` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.members.read` | List active organization members (paginated) |
| `POST` | `/api/v1/organizations/:organizationId/members` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.members.invite` | Add existing user with an `ORGANIZATION` role |
| `PATCH` | `/api/v1/organizations/:organizationId/members/:membershipId/role` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.members.update` | Change an active member's organization role |
| `DELETE` | `/api/v1/organizations/:organizationId/members/:membershipId` | `JwtAuthGuard`, `OrganizationAuthGuard`, `PermissionsGuard` | `organization.members.remove` | Deactivate membership (`INACTIVE`) and revoke access |

### Part 3 — Platform User Management (`/api/v1/admin/users`)

| Method | Path | Auth / Guards | Required Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/users` | `JwtAuthGuard`, `PermissionsGuard` | `users.read` | List platform users (paginated, filterable by `email`, `emailVerified`) |
| `GET` | `/api/v1/admin/users/:userId` | `JwtAuthGuard`, `PermissionsGuard` | `users.read` | Inspect safe user details, system roles, and org memberships |
| `POST` | `/api/v1/admin/users/:userId/system-roles` | `JwtAuthGuard`, `PermissionsGuard` | `users.manage` | Assign a built-in `SYSTEM` role (`PARTICIPANT`, `ADMIN`) |
| `DELETE` | `/api/v1/admin/users/:userId/system-roles/:roleCode` | `JwtAuthGuard`, `PermissionsGuard` | `users.manage` | Revoke a `SYSTEM` role |

---

## 2. Organization Ownership & Membership Rules

1. **Atomic creation**: `POST /organizations` creates the `Organization` and the creator's `OWNER` `OrganizationMembership` inside a single `prisma.$transaction`.
2. **Last OWNER protection**: An organization must always have at least one active `OWNER`. Demoting or removing the final active `OWNER` is rejected with `409 Conflict`.
3. **Privilege escalation prevention**:
   - Organization `ADMIN` cannot add a member as `OWNER`, promote a member to `OWNER`, demote an `OWNER`, or remove an `OWNER` (`403 Forbidden`).
   - Users cannot modify their own organization role (`403 Forbidden`).
   - `SYSTEM` roles (`PARTICIPANT`, `ADMIN`) cannot be assigned as organization roles (`400 Bad Request`).
4. **Cross-organization isolation (IDOR prevention)**: `changeMemberRole` and `removeMember` always scope lookups by `{ id: membershipId, organizationId: org.organizationId }`, returning `404 Not Found` for membership IDs belonging to another organization.
5. **Historical preservation & immediate revocation**: `DELETE /members/:membershipId` sets `status = MembershipStatus.INACTIVE` rather than physically deleting the row. `OrganizationAuthorizationService` requires `MembershipStatus.ACTIVE`, so access is revoked immediately.

---

## 3. System Role Management Rules

1. **System scope only**: Only `PARTICIPANT` and `ADMIN` (`RoleScope.SYSTEM`) are accepted (`400 Bad Request` for organization roles or unknown codes).
2. **Self-modification prevention**: Platform administrators cannot assign or revoke system roles on their own account (`403 Forbidden`).
3. **Last platform ADMIN protection**: Revoking the final active `SYSTEM:ADMIN` assignment is rejected with `409 Conflict`.
4. **Secret protection**: Admin user endpoints never return `passwordHash`, `tokenVersion`, `sessions`, `emailVerificationTokens`, or `passwordResetTokens`.

---

## 4. Known Limitations

1. **Direct member addition without invitation consent**: `POST /organizations/:organizationId/members` adds an existing user directly. An email invitation/acceptance token workflow is deferred to a future phase.
2. **Audit logging**: Administrative system-role assignments and revocations are logged via structured NestJS `Logger` (`[AUDIT]`), as no persistent database audit-log table exists yet in the schema.
3. **Organization deletion**: `DELETE /organizations/:organizationId` is deferred pending an approved data-retention policy.
