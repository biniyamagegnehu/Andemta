# RBAC Permissions Catalog and Role-Permission Mapping

**Phase 4.2 — Andemta Ethiopian Consumer Research Marketplace**

This document defines the authorization permission catalog established in Phase 4.2, the role-permission assignment matrix enforced by the system, naming conventions, scope rules, and items deferred to later phases.

---

## 1. Permission Naming Convention

All permission codes use the dot-separated **resource.action** format:

```
<resource>[.<sub-resource>].<action>
```

- **Resource names** use underscores for multi-word terms (e.g. `product_testing`).
- **Sub-resources** are further segments separated by dots (e.g. `organization.members.read`).
- **Action names** are lowercase verbs: `read`, `create`, `update`, `delete`, `publish`, `manage`, `invite`, `respond`, `participate`, `distribute`, `claim`, `export`.

This convention is enforced in `apps/api/src/modules/rbac/constants/permissions.ts` as a typed `as const` object.

---

## 2. Permission Catalog

| Constant Key | Permission Code | Meaning |
|---|---|---|
| `USERS_READ` | `users.read` | View user accounts and platform identity profiles |
| `USERS_MANAGE` | `users.manage` | Manage platform user statuses and system-level restrictions |
| `PLATFORM_ADMIN` | `platform.admin` | Full platform administrative control and configuration |
| `PLATFORM_AUDIT_READ` | `platform.audit.read` | Inspect platform-wide audit and security event logs |
| `PLATFORM_METRICS_READ` | `platform.metrics.read` | Monitor platform-level operational and research volume metrics |
| `ORGANIZATION_READ` | `organization.read` | View organization details, public profile, and status |
| `ORGANIZATION_UPDATE` | `organization.update` | Update organization profile, branding, and preferences |
| `ORGANIZATION_DELETE` | `organization.delete` | Permanently decommission or delete an organization |
| `ORGANIZATION_BILLING_MANAGE` | `organization.billing.manage` | Manage subscription tiers, invoices, and billing instruments |
| `ORGANIZATION_MEMBERS_READ` | `organization.members.read` | View member rosters and roles within an organization |
| `ORGANIZATION_MEMBERS_INVITE` | `organization.members.invite` | Invite new members and researchers into an organization |
| `ORGANIZATION_MEMBERS_UPDATE` | `organization.members.update` | Modify member roles and statuses within an organization |
| `ORGANIZATION_MEMBERS_REMOVE` | `organization.members.remove` | Revoke membership and remove members from an organization |
| `RESEARCH_CREATE` | `research.create` | Create new research studies and project scopes |
| `RESEARCH_READ` | `research.read` | View research study designs, targets, and criteria |
| `RESEARCH_UPDATE` | `research.update` | Edit and maintain research study configurations |
| `RESEARCH_DELETE` | `research.delete` | Delete draft or archived research studies |
| `RESEARCH_PUBLISH` | `research.publish` | Launch or publish research studies into active field status |
| `SURVEY_CREATE` | `survey.create` | Author questionnaires, survey logic, and response forms |
| `SURVEY_READ` | `survey.read` | View survey instruments and questions |
| `SURVEY_UPDATE` | `survey.update` | Edit survey structures and parameters |
| `SURVEY_DELETE` | `survey.delete` | Remove draft or unlaunched surveys |
| `SURVEY_PUBLISH` | `survey.publish` | Activate surveys for participant data collection |
| `SURVEY_RESPOND` | `survey.respond` | Submit responses to active research surveys (participant activity) |
| `PARTICIPANTS_READ` | `participants.read` | View anonymized participant pool demographics and availability |
| `PARTICIPANTS_RECRUIT` | `participants.recruit` | Screen, recruit, and assign targeted participants to studies |
| `PRODUCT_TESTING_CREATE` | `product_testing.create` | Create product testing campaigns, briefs, and logistics |
| `PRODUCT_TESTING_READ` | `product_testing.read` | View product testing briefs, requirements, and protocols |
| `PRODUCT_TESTING_UPDATE` | `product_testing.update` | Modify product testing campaign configurations |
| `PRODUCT_TESTING_DELETE` | `product_testing.delete` | Delete draft or archived product testing campaigns |
| `PRODUCT_TESTING_PARTICIPATE` | `product_testing.participate` | Participate in physical or digital product testing sessions |
| `REPORTS_READ` | `reports.read` | View aggregated research analytics, insights, and summaries |
| `REPORTS_EXPORT` | `reports.export` | Export anonymized raw survey datasets and analytical reports |
| `REWARDS_DISTRIBUTE` | `rewards.distribute` | Authorize incentive allocations and participant payouts |
| `REWARDS_READ` | `rewards.read` | View incentive transaction records and payout histories |
| `REWARDS_CLAIM` | `rewards.claim` | Claim earned incentives and initiate participant reward withdrawals |

**Total: 36 permissions.**

---

## 3. Authorization Scope Rules

| Rule | Explanation |
|---|---|
| A role belongs to exactly one scope (`SYSTEM` or `ORGANIZATION`) | Enforced by DB unique constraint `(scope, code)` |
| System roles are platform-wide | They apply regardless of organization membership |
| Organization roles are scoped | They apply only within a specific organization |
| A user may hold multiple system roles | e.g., `PARTICIPANT` + `ADMIN` simultaneously |
| A user may hold organization roles in multiple organizations | With a potentially different role in each |
| System roles must never be used as organization membership roles | Enforced by `RolePermissionService.validateScopeCompatibility` |
| Organization roles must never be used as platform-wide assignments | Enforced by `RolePermissionService.validateScopeCompatibility` |
| Platform ADMIN does not auto-grant organization OWNER | The two scopes are fully independent |

---

## 4. Role-Permission Assignment Matrix

The canonical source of truth is `apps/api/src/modules/rbac/constants/role-permissions.ts`.

### 4.1 SYSTEM:PARTICIPANT

Minimum permissions for consumer research activities only.

| Permission | Granted |
|---|:---:|
| `survey.respond` | ✅ |
| `product_testing.participate` | ✅ |
| `rewards.claim` | ✅ |
| Any management, create, update, delete, platform, or organization permission | ❌ |

### 4.2 SYSTEM:ADMIN

Platform administration with read-only visibility into research operations. Does NOT own organizations.

| Category | Permissions Granted |
|---|---|
| User management | `users.read`, `users.manage` |
| Platform | `platform.admin`, `platform.audit.read`, `platform.metrics.read` |
| Cross-org read | `organization.read`, `research.read`, `survey.read`, `reports.read`, `rewards.read` |
| Absent | `organization.delete`, `organization.billing.manage`, `research.create`, all org membership actions |

### 4.3 ORGANIZATION:OWNER

Full organizational authority including billing and destructive operations.

| Category | Permissions Granted |
|---|---|
| Organization | `organization.read`, `organization.update`, `organization.delete`, `organization.billing.manage` |
| Membership | `organization.members.read`, `.invite`, `.update`, `.remove` |
| Research | `research.create`, `.read`, `.update`, `.delete`, `.publish` |
| Survey | `survey.create`, `.read`, `.update`, `.delete`, `.publish` |
| Participants | `participants.read`, `participants.recruit` |
| Product Testing | `product_testing.create`, `.read`, `.update`, `.delete` |
| Reports | `reports.read`, `reports.export` |
| Rewards | `rewards.distribute`, `rewards.read` |
| Absent | `platform.*`, `users.manage`, `rewards.claim` |

### 4.4 ORGANIZATION:ADMIN

Delegated management. Cannot delete the organization or manage billing.

| Difference from OWNER | Detail |
|---|---|
| `organization.delete` | ❌ NOT granted |
| `organization.billing.manage` | ❌ NOT granted |
| All other OWNER permissions | ✅ Granted |

### 4.5 ORGANIZATION:RESEARCHER

Research practitioner. Cannot delete research or surveys. Cannot manage members or billing.

| Category | Permissions Granted |
|---|---|
| Organization | `organization.read`, `organization.members.read` |
| Research | `research.create`, `.read`, `.update`, `.publish` (no `.delete`) |
| Survey | `survey.create`, `.read`, `.update`, `.publish` (no `.delete`) |
| Participants | `participants.read`, `participants.recruit` |
| Product Testing | `product_testing.create`, `.read`, `.update` (no `.delete`) |
| Reports | `reports.read`, `reports.export` |
| Absent | Membership management, billing, `organization.update`, `organization.delete`, `rewards.*` |

### 4.6 ORGANIZATION:VIEWER

Read-only stakeholder. No write operations of any kind.

| Permissions Granted (all `.read`) |
|---|
| `organization.read` |
| `organization.members.read` |
| `research.read` |
| `survey.read` |
| `product_testing.read` |
| `reports.read` |

---

## 5. TypeScript API Reference

### PERMISSION constant (`constants/permissions.ts`)

```typescript
import { PERMISSION, PermissionCode, ALL_PERMISSION_CODES, isValidPermissionCode } from '@/modules/rbac';

PERMISSION.RESEARCH_CREATE          // → 'research.create'
isValidPermissionCode('survey.read') // → true
```

### BUILT_IN_ROLE_PERMISSION_MAPPINGS (`constants/role-permissions.ts`)

```typescript
import { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from '@/modules/rbac';

BUILT_IN_ROLE_PERMISSION_MAPPINGS['SYSTEM:PARTICIPANT']
// → ['survey.respond', 'product_testing.participate', 'rewards.claim']
```

### RolePermissionService methods

| Method | Description |
|---|---|
| `getRoleByScope(scope, code)` | Returns `RoleDto \| null` |
| `getRoleByScopeOrThrow(scope, code)` | Returns `RoleDto` or throws `NotFoundException` |
| `getAllPermissions()` | Returns all active `PermissionDto[]` |
| `getPermissionByCode(code)` | Returns `PermissionDto \| null` |
| `getPermissionsForRole(scope, code)` | Returns `PermissionDto[]` for the role |
| `getRoleWithPermissions(scope, code)` | Returns `RoleWithPermissionsDto \| null` |
| `roleHasPermission(scope, code, permissionCode)` | Returns `boolean` |
| `validateScopeCompatibility(role, intendedScope)` | Throws `BadRequestException` on mismatch |
| `syncBuiltInRolePermissions()` | Idempotent upsert sync. Returns `SyncSummary` |

---

## 6. Deferred Items (Phase 4.3+)

| Item | Phase |
|---|---|
| NestJS `@RequirePermission()` decorator | 4.3 |
| `JwtAuthGuard` → permission enforcement via JWT claims | 4.3 |
| User role assignment REST endpoints | 4.3 |
| Organization membership APIs | 4.3 |
| Custom (non-built-in) role creation | Future |
| Fine-grained resource-instance permissions (row-level) | Future |
| Payment-specific permissions (`payments.*`) | Future (payment module) |
