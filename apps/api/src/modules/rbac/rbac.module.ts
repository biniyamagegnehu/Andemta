import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RolePermissionService } from './services/role-permission.service';

/**
 * RbacModule — Phase 4.2: Permissions Catalog and Role-Permission Management.
 *
 * Provides the centralized RBAC service layer: role queries, permission catalog
 * access, scope validation, and idempotent role-permission synchronization.
 *
 * Does NOT provide:
 * - HTTP controllers or REST endpoints (Phase 4.3+)
 * - NestJS authorization guards or decorators (Phase 4.3+)
 * - User role assignment APIs (Phase 4.3+)
 */
@Module({
  imports: [DatabaseModule],
  providers: [RolePermissionService],
  exports: [RolePermissionService],
})
export class RbacModule {}
