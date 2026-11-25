import { SetMetadata } from '@nestjs/common';
import {
  PermissionCode,
  isValidPermissionCode,
} from '../constants/permissions';

/**
 * Centralized metadata key used by @RequirePermissions and PermissionsGuard.
 */
export const REQUIRED_PERMISSIONS_KEY = 'rbac:required_permissions';

/**
 * Declares the permissions required to access a controller or route handler.
 *
 * Semantics:
 * - Multiple permissions use **AND** semantics: the authenticated user must
 *   possess ALL declared permissions within their respective scopes.
 * - Handler-level metadata overrides controller-level metadata when present;
 *   otherwise handlers inherit controller-level metadata.
 * - Rejects empty or unrecognized permission codes at decoration time.
 *
 * Example:
 * ```ts
 * @RequirePermissions(PERMISSION.RESEARCH_READ, PERMISSION.REPORTS_READ)
 * ```
 */
export const RequirePermissions = (
  ...permissions: PermissionCode[]
): MethodDecorator & ClassDecorator => {
  if (!permissions || permissions.length === 0) {
    throw new Error(
      '@RequirePermissions requires at least one valid PermissionCode.',
    );
  }

  for (const permission of permissions) {
    if (typeof permission !== 'string' || !isValidPermissionCode(permission)) {
      throw new Error(
        `Invalid permission code supplied to @RequirePermissions: "${String(permission)}".`,
      );
    }
  }

  const uniquePermissions = Array.from(new Set(permissions));
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, uniquePermissions);
};
