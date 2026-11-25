export { RbacModule } from './rbac.module';
export { RolePermissionService } from './services/role-permission.service';
export {
  OrganizationAuthorizationService,
  ORGANIZATION_ID_UUID_REGEX,
} from './services/organization-authorization.service';
export { PermissionsGuard } from './guards/permissions.guard';
export { OrganizationAuthGuard } from './guards/organization-auth.guard';
export {
  RequirePermissions,
  REQUIRED_PERMISSIONS_KEY,
} from './decorators/require-permissions.decorator';
export { CurrentOrganization } from './decorators/current-organization.decorator';
export {
  PERMISSION,
  PERMISSION_SCOPES,
  ALL_PERMISSION_CODES,
  isValidPermissionCode,
  getPermissionScope,
} from './constants/permissions';
export type { PermissionCode } from './constants/permissions';
export { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from './constants/role-permissions';
export type {
  RoleDto,
  PermissionDto,
  RoleWithPermissionsDto,
  SyncSummary,
  OrganizationContext,
} from './interfaces/rbac.interfaces';
