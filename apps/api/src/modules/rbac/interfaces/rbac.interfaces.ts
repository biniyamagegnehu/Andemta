import { RoleScope } from '@prisma/client';
import { PermissionCode } from '../constants/permissions';

/**
 * Data transfer object representing a Role record.
 */
export interface RoleDto {
  id: string;
  scope: RoleScope;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  isBuiltIn: boolean;
}

/**
 * Data transfer object representing a Permission record.
 */
export interface PermissionDto {
  id: string;
  code: PermissionCode;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * A role with its associated permissions resolved.
 */
export interface RoleWithPermissionsDto extends RoleDto {
  permissions: PermissionDto[];
}

/**
 * Result summary returned by the idempotent sync operation.
 */
export interface SyncSummary {
  /** Number of new RolePermission records created. */
  created: number;
  /** Number of existing RolePermission records that were already in place (skipped). */
  skipped: number;
  /** Total roles processed during sync. */
  rolesProcessed: number;
  /** Total permission codes referenced during sync. */
  permissionsReferenced: number;
  /** Any permission codes from the mapping that were not found in the database. */
  missingPermissions: string[];
  /** Any role scope:code keys from the mapping that were not found in the database. */
  missingRoles: string[];
}
