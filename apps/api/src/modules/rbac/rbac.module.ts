import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RolePermissionService } from './services/role-permission.service';
import { OrganizationAuthorizationService } from './services/organization-authorization.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { OrganizationAuthGuard } from './guards/organization-auth.guard';

/**
 * RbacModule — Phase 4.2, 4.3 & 4.4: Permissions Catalog, Role-Permission Management,
 * Runtime Authorization Guards, and Organization Membership Authorization.
 *
 * Provides:
 * - RolePermissionService (catalog queries, scope validation, idempotent sync, system permissions)
 * - OrganizationAuthorizationService (organization context & membership validation)
 * - OrganizationAuthGuard (validates organization & membership context)
 * - PermissionsGuard (enforces @RequirePermissions metadata using JwtAuthGuard + DB lookups)
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [
    RolePermissionService,
    OrganizationAuthorizationService,
    OrganizationAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    RolePermissionService,
    OrganizationAuthorizationService,
    OrganizationAuthGuard,
    PermissionsGuard,
  ],
})
export class RbacModule {}
