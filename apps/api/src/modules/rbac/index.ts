export { RbacModule } from './rbac.module';
export { RolePermissionService } from './services/role-permission.service';
export { PERMISSION, ALL_PERMISSION_CODES, isValidPermissionCode } from './constants/permissions';
export type { PermissionCode } from './constants/permissions';
export { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from './constants/role-permissions';
export type {
  RoleDto,
  PermissionDto,
  RoleWithPermissionsDto,
  SyncSummary,
} from './interfaces/rbac.interfaces';
