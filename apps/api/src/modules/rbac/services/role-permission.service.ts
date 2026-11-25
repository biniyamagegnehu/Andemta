import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  RoleScope,
  MembershipStatus,
  OrganizationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  PermissionCode,
  isValidPermissionCode,
  getPermissionScope,
} from '../constants/permissions';
import { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from '../constants/role-permissions';
import {
  RoleDto,
  PermissionDto,
  RoleWithPermissionsDto,
  SyncSummary,
} from '../interfaces/rbac.interfaces';

/**
 * RolePermissionService — Phase 4.2: Permissions Catalog and Role-Permission Management.
 *
 * Provides safe, read-oriented queries over the RBAC schema (Roles, Permissions,
 * RolePermissions) and an idempotent synchronization mechanism for built-in
 * role-permission assignments.
 *
 * This service does NOT:
 * - Assign roles to users (Phase 4.3)
 * - Expose HTTP endpoints or guards (Phase 4.3)
 * - Delete or modify custom role-permission assignments added outside the built-in catalog
 */
@Injectable()
export class RolePermissionService {
  private readonly logger = new Logger(RolePermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Role Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns a single Role matching the given scope and code, or null if not found.
   */
  async getRoleByScope(
    scope: RoleScope,
    code: string,
  ): Promise<RoleDto | null> {
    const role = await this.prisma.role.findFirst({
      where: { scope, code },
    });

    return role ? this.toRoleDto(role) : null;
  }

  /**
   * Returns a Role, throwing NotFoundException if it does not exist.
   */
  async getRoleByScopeOrThrow(scope: RoleScope, code: string): Promise<RoleDto> {
    const role = await this.getRoleByScope(scope, code);
    if (!role) {
      throw new NotFoundException(
        `Role not found: scope=${scope} code=${code}`,
      );
    }
    return role;
  }

  // ---------------------------------------------------------------------------
  // Permission Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns all active permissions in the catalog.
   */
  async getAllPermissions(): Promise<PermissionDto[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return permissions.map((p) => this.toPermissionDto(p));
  }

  /**
   * Returns a single Permission by its code, or null if not found.
   */
  async getPermissionByCode(
    code: PermissionCode,
  ): Promise<PermissionDto | null> {
    const permission = await this.prisma.permission.findUnique({
      where: { code },
    });
    return permission ? this.toPermissionDto(permission) : null;
  }

  // ---------------------------------------------------------------------------
  // Role → Permission Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns all permissions assigned to the specified role.
   * Returns an empty array if the role does not exist.
   */
  async getPermissionsForRole(
    scope: RoleScope,
    code: string,
  ): Promise<PermissionDto[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role: { scope, code },
      },
      include: {
        permission: true,
      },
    });

    return rolePermissions.map((rp) => this.toPermissionDto(rp.permission));
  }

  /**
   * Returns the role with its full permission list resolved.
   * Returns null if the role does not exist.
   */
  async getRoleWithPermissions(
    scope: RoleScope,
    code: string,
  ): Promise<RoleWithPermissionsDto | null> {
    const role = await this.prisma.role.findFirst({
      where: { scope, code },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) return null;

    return {
      ...this.toRoleDto(role),
      permissions: role.rolePermissions.map((rp) =>
        this.toPermissionDto(rp.permission),
      ),
    };
  }

  /**
   * Returns true if the specified role has been assigned the given permission.
   * Returns false for non-existent roles or permissions.
   */
  async roleHasPermission(
    scope: RoleScope,
    code: string,
    permissionCode: PermissionCode,
  ): Promise<boolean> {
    const count = await this.prisma.rolePermission.count({
      where: {
        role: { scope, code },
        permission: { code: permissionCode },
      },
    });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Runtime User Authorization Queries (Phase 4.3)
  // ---------------------------------------------------------------------------

  /**
   * Loads all active system-level permission codes granted to a user
   * via active UserSystemRole assignments in a single database query.
   */
  async getUserSystemPermissions(
    userId: string,
  ): Promise<Set<PermissionCode>> {
    const userSystemRoles = await this.prisma.userSystemRole.findMany({
      where: {
        userId,
        roleScope: RoleScope.SYSTEM,
        role: {
          isActive: true,
          scope: RoleScope.SYSTEM,
        },
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              where: {
                permission: {
                  isActive: true,
                },
              },
              select: {
                permission: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const granted = new Set<PermissionCode>();
    for (const assignment of userSystemRoles) {
      for (const rp of assignment.role.rolePermissions) {
        if (isValidPermissionCode(rp.permission.code)) {
          granted.add(rp.permission.code);
        }
      }
    }

    return granted;
  }

  /**
   * Loads both active system role codes and active system permission codes
   * for an authenticated user in a single query.
   */
  async getUserSystemAuthorizationContext(userId: string): Promise<{
    userId: string;
    systemRoles: string[];
    permissions: PermissionCode[];
  }> {
    const userSystemRoles = await this.prisma.userSystemRole.findMany({
      where: {
        userId,
        roleScope: RoleScope.SYSTEM,
        role: {
          isActive: true,
          scope: RoleScope.SYSTEM,
        },
      },
      select: {
        role: {
          select: {
            code: true,
            rolePermissions: {
              where: {
                permission: {
                  isActive: true,
                },
              },
              select: {
                permission: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const roleCodes = new Set<string>();
    const granted = new Set<PermissionCode>();

    for (const assignment of userSystemRoles) {
      roleCodes.add(assignment.role.code);
      for (const rp of assignment.role.rolePermissions) {
        if (isValidPermissionCode(rp.permission.code)) {
          granted.add(rp.permission.code);
        }
      }
    }

    return {
      userId,
      systemRoles: Array.from(roleCodes),
      permissions: Array.from(granted),
    };
  }

  /**
   * Loads all active organization-level permission codes granted to a user
   * within a specific organization in a single database query.
   *
   * Enforces:
   * - Active membership (MembershipStatus.ACTIVE)
   * - Active organization (OrganizationStatus.ACTIVE)
   * - Active role with RoleScope.ORGANIZATION
   * - Active permissions
   */
  async getUserOrganizationPermissions(
    userId: string,
    organizationId: string,
  ): Promise<Set<PermissionCode>> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      select: {
        status: true,
        roleScope: true,
        organization: {
          select: {
            status: true,
          },
        },
        role: {
          select: {
            isActive: true,
            scope: true,
            rolePermissions: {
              where: {
                permission: {
                  isActive: true,
                },
              },
              select: {
                permission: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.organization.status !== OrganizationStatus.ACTIVE ||
      membership.roleScope !== RoleScope.ORGANIZATION ||
      membership.role.scope !== RoleScope.ORGANIZATION ||
      !membership.role.isActive
    ) {
      return new Set<PermissionCode>();
    }

    const granted = new Set<PermissionCode>();
    for (const rp of membership.role.rolePermissions) {
      if (isValidPermissionCode(rp.permission.code)) {
        granted.add(rp.permission.code);
      }
    }

    return granted;
  }

  /**
   * Evaluates whether a user satisfies ALL required permissions using AND semantics
   * and strict SYSTEM vs ORGANIZATION scope isolation.
   *
   * - System-scoped permissions are checked strictly against UserSystemRole.
   * - Organization-scoped permissions are checked strictly against the user's
   *   active OrganizationMembership for the provided organizationId.
   * - If any organization-scoped permission is required without a valid
   *   organizationId, returns false (never falls back to system roles).
   */
  async userHasPermissions(
    userId: string,
    requiredPermissions: PermissionCode[],
    organizationId?: string,
  ): Promise<boolean> {
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return false;
    }

    const systemRequired: PermissionCode[] = [];
    const orgRequired: PermissionCode[] = [];

    for (const code of requiredPermissions) {
      if (!isValidPermissionCode(code)) {
        return false;
      }
      if (getPermissionScope(code) === RoleScope.SYSTEM) {
        systemRequired.push(code);
      } else {
        orgRequired.push(code);
      }
    }

    // Organization-scoped permissions require a valid organization context
    if (orgRequired.length > 0 && !organizationId) {
      return false;
    }

    const [systemGranted, orgGranted] = await Promise.all([
      systemRequired.length > 0
        ? this.getUserSystemPermissions(userId)
        : Promise.resolve(new Set<PermissionCode>()),
      orgRequired.length > 0 && organizationId
        ? this.getUserOrganizationPermissions(userId, organizationId)
        : Promise.resolve(new Set<PermissionCode>()),
    ]);

    const hasSystem = systemRequired.every((code) => systemGranted.has(code));
    const hasOrg = orgRequired.every((code) => orgGranted.has(code));

    return hasSystem && hasOrg;
  }

  // ---------------------------------------------------------------------------
  // Scope Validation
  // ---------------------------------------------------------------------------

  /**
   * Validates that the given role is used only within its authorized scope.
   *
   * Rules enforced:
   * - SYSTEM roles must not be used as organization membership roles.
   * - ORGANIZATION roles must not be used as system (platform-wide) roles.
   *
   * Throws BadRequestException on violation.
   */
  validateScopeCompatibility(
    role: RoleDto,
    intendedScope: RoleScope,
  ): void {
    if (role.scope !== intendedScope) {
      throw new BadRequestException(
        `Scope mismatch: role "${role.code}" belongs to scope "${role.scope}" ` +
          `but was used in context requiring scope "${intendedScope}". ` +
          `System roles must not be used as organization roles, and vice versa.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Idempotent Sync
  // ---------------------------------------------------------------------------

  /**
   * Synchronises the built-in role-permission assignments from BUILT_IN_ROLE_PERMISSION_MAPPINGS
   * into the database using upsert semantics (create if absent, skip if present).
   *
   * This operation is:
   * - Safe to run multiple times without side-effects.
   * - Non-destructive: it never removes existing assignments.
   * - Additive: it adds any missing assignments declared in the mapping.
   *
   * Returns a SyncSummary describing what was created, skipped, and any missing
   * roles or permissions that could not be resolved (warnings only, not errors).
   */
  async syncBuiltInRolePermissions(): Promise<SyncSummary> {
    this.logger.log('Starting built-in role-permission sync…');

    const summary: SyncSummary = {
      created: 0,
      skipped: 0,
      rolesProcessed: 0,
      permissionsReferenced: 0,
      missingRoles: [],
      missingPermissions: [],
    };

    // Pre-load all roles and permissions for efficient lookup
    const [allRoles, allPermissions] = await Promise.all([
      this.prisma.role.findMany(),
      this.prisma.permission.findMany(),
    ]);

    const roleIndex = new Map(
      allRoles.map((r) => [`${r.scope}:${r.code}`, r]),
    );
    const permissionIndex = new Map(allPermissions.map((p) => [p.code, p]));

    for (const [roleKey, permissionCodes] of Object.entries(
      BUILT_IN_ROLE_PERMISSION_MAPPINGS,
    )) {
      const role = roleIndex.get(roleKey);
      if (!role) {
        this.logger.warn(`Sync: role not found in database — key "${roleKey}"`);
        summary.missingRoles.push(roleKey);
        continue;
      }

      summary.rolesProcessed++;

      for (const code of permissionCodes) {
        summary.permissionsReferenced++;

        if (!isValidPermissionCode(code)) {
          this.logger.warn(
            `Sync: "${code}" is not a recognized PermissionCode — skipping`,
          );
          if (!summary.missingPermissions.includes(code)) {
            summary.missingPermissions.push(code);
          }
          continue;
        }

        const permission = permissionIndex.get(code);
        if (!permission) {
          this.logger.warn(
            `Sync: permission "${code}" not found in database — skipping`,
          );
          if (!summary.missingPermissions.includes(code)) {
            summary.missingPermissions.push(code);
          }
          continue;
        }

        // Upsert: create the assignment if it does not already exist.
        // The unique constraint (roleId, permissionId) ensures idempotency.
        const existing = await this.prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
        });

        if (existing) {
          summary.skipped++;
        } else {
          await this.prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
          summary.created++;
          this.logger.debug(`Sync: created ${roleKey} → ${code}`);
        }
      }
    }

    this.logger.log(
      `Sync complete — created: ${summary.created}, skipped: ${summary.skipped}, ` +
        `roles processed: ${summary.rolesProcessed}, ` +
        `missing roles: ${summary.missingRoles.length}, ` +
        `missing permissions: ${summary.missingPermissions.length}`,
    );

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Private Mappers
  // ---------------------------------------------------------------------------

  private toRoleDto(role: {
    id: string;
    scope: RoleScope;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    isBuiltIn: boolean;
  }): RoleDto {
    return {
      id: role.id,
      scope: role.scope,
      code: role.code,
      name: role.name,
      description: role.description ?? '',
      isActive: role.isActive,
      isBuiltIn: role.isBuiltIn,
    };
  }

  private toPermissionDto(permission: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
  }): PermissionDto {
    return {
      id: permission.id,
      code: permission.code as PermissionCode,
      name: permission.name,
      description: permission.description ?? '',
      isActive: permission.isActive,
    };
  }
}
