import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RolePermissionService } from './services/role-permission.service';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * RbacModule — Phase 4.2 & 4.3: Permissions Catalog, Role-Permission Management,
 * and Runtime Authorization Guards.
 *
 * Provides:
 * - RolePermissionService (queries, scope validation, idempotent sync, runtime permission checks)
 * - PermissionsGuard (enforces @RequirePermissions metadata using JwtAuthGuard + DB lookups)
 *
 * Does NOT provide:
 * - Organization or membership management endpoints (Phase 4.4+)
 * - User role assignment endpoints (Phase 4.4+)
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [RolePermissionService, PermissionsGuard],
  exports: [RolePermissionService, PermissionsGuard],
})
export class RbacModule {}
