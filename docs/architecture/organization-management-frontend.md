# Organization Registration and Management — Frontend Architecture (Phase 5.2)

## Overview

Phase 5.2 implements the frontend experience for registering, listing, viewing, and updating organizations in the Andemta Next.js App Router application (`apps/web`), backed by the NestJS organization endpoints introduced in Phase 4.5 (`POST /api/v1/organizations`, `GET /api/v1/organizations`, `GET /api/v1/organizations/:organizationId`, and `PATCH /api/v1/organizations/:organizationId`).

## Key Modules & Routes

### 1. API Client & Types
- **`apps/web/src/lib/api/types.ts`**
  - `CreateOrganizationDto`: `{ name: string; slug?: string; type?: OrganizationType }`
  - `UpdateOrganizationDto`: `{ name?: string; type?: OrganizationType }`
  - `UserOrganization`: Organization model returned by backend (`id`, `name`, `slug`, `type`, `status`, `createdAt`, `updatedAt`, `roleCode?`).
- **`apps/web/src/lib/api/organizations-client.ts`**
  - `listMyOrganizations(params?)`: `GET /organizations`
  - `createOrganization(dto)`: `POST /organizations`
  - `getOrganization(organizationId)`: `GET /organizations/:organizationId`
  - `updateOrganization(organizationId, dto)`: `PATCH /organizations/:organizationId`
  - All calls use `authenticatedRequest` with in-memory `tokenManager` Bearer tokens.

### 2. Organization Context Synchronization
- **`apps/web/src/context/organization-context.tsx`**
  - `reloadOrganizations(preferredOrgId?: string)`: Reloads the authenticated user's organizations from `GET /organizations` and optionally selects `preferredOrgId` when present in the returned list, ensuring newly created or updated organizations immediately reflect in `OrganizationSelector` and `AuthorizationProvider`.

### 3. Validation & Formatting Helpers
- **`apps/web/src/components/organizations/organization-validation.ts`**
  - `ORGANIZATION_TYPE_OPTIONS` (`BUSINESS`, `UNIVERSITY`, `OTHER`) and `formatOrganizationTypeLabel`.
  - `validateCreateOrganizationForm`: Mirrors `CreateOrganizationDto` constraints (trimmed `name` 2–120 chars; optional lowercase `slug` 2–80 chars matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; `type` enum).
  - `validateUpdateOrganizationForm` and `buildChangedOrganizationPayload`: Mirrors `UpdateOrganizationDto` (`name`, `type`) and emits only modified fields.

### 4. Pages & Components
- **`/organizations` (`apps/web/src/app/(authenticated)/organizations/page.tsx`)**
  - Lists organizations for the authenticated user, displays loading/empty/error-with-retry states, includes a `"Register Organization"` action (`/organizations/new`), `"View Details"` link (`/organizations/[organizationId]`), and `"Select organization"` switcher.
- **`/organizations/new` (`apps/web/src/app/(authenticated)/organizations/new/page.tsx` + `organization-create-form.tsx`)**
  - Renders `OrganizationCreateForm`, submits `POST /organizations` without client-supplied `role` or `status`, refreshes `OrganizationProvider` with `reloadOrganizations(created.id)`, and navigates to `/organizations/[created.id]`.
- **`/organizations/[organizationId]` (`apps/web/src/app/(authenticated)/organizations/[organizationId]/page.tsx` + `organization-update-form.tsx`)**
  - Loads organization details via `GET /organizations/:organizationId`, aligns active organization context if needed, handles `403` (`UnauthorizedState`), `404` (not found), and generic errors with retry, and gates `OrganizationUpdateForm` behind `<PermissionGate scope="organization" permission="organization.update">` once authorization context is aligned.
