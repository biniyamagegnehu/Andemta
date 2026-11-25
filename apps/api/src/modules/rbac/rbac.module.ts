import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RolePermissionService } from './services/role-permission.service';
import { OrganizationAuthorizationService } from './services/organization-authorization.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { OrganizationAuthGuard } from './guards/organization-auth.guard';
import { AuthorizationContextController } from './controllers/authorization-context.controller';

/**
 * RbacModule — Phase 4.2, 4.3, 4.4 & 4.7: Permissions Catalog, Role-Permission Management,
 * Runtime Authorization Guards, Organization Membership Authorization, and Read-Only Context API.
 *
 * Provides:
 * - RolePermissionService (catalog queries, scope validation, idempotent sync, system permissions)
 * - OrganizationAuthorizationService (organization context & membership validation)
 * - OrganizationAuthGuard (validates organization & membership context)
 * - PermissionsGuard (enforces @RequirePermissions metadata using JwtAuthGuard + DB lookups)
 * - AuthorizationContextController (read-only system & organization permission context endpoints)
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AuthorizationContextController],
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
