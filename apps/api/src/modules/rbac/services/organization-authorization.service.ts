import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  RoleScope,
  OrganizationStatus,
  MembershipStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  PermissionCode,
  isValidPermissionCode,
} from '../constants/permissions';
import { OrganizationContext } from '../interfaces/rbac.interfaces';

export const ORGANIZATION_ID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OrganizationAuthorizationService — Phase 4.4.
 *
 * Resolves and validates organization context and user membership against
 * PostgreSQL in a single efficient query (no N+1 lookups).
 *
 * Enforces:
 * - Valid UUID format for organizationId (400 Bad Request if malformed)
 * - Organization existence (404 Not Found if absent)
 * - Active organization status (403 Forbidden if suspended/inactive)
 * - Active user membership (403 Forbidden if missing, invited, suspended, or inactive)
 * - Active organization-scoped role and active permissions
 */
@Injectable()
export class OrganizationAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extracts the organization ID from trusted route parameters.
   * Never reads from request body or arbitrary client headers.
   */
  extractOrganizationIdFromParams(
    params?: Record<string, string | undefined>,
  ): string {
    const rawOrgId = params?.organizationId ?? params?.orgId;
    if (!rawOrgId || typeof rawOrgId !== 'string' || rawOrgId.trim() === '') {
      throw new ForbiddenException('Organization context is required');
    }
    return rawOrgId.trim();
  }

  /**
   * Validates that `organizationId` is a valid UUID, the organization exists
   * and is ACTIVE, and `userId` holds an ACTIVE membership with an active
   * ORGANIZATION-scoped role.
   *
   * Returns a typed, safe OrganizationContext without exposing Prisma internals.
   */
  async validateOrganizationAccess(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationContext> {
    if (
      !organizationId ||
      typeof organizationId !== 'string' ||
      !ORGANIZATION_ID_UUID_REGEX.test(organizationId)
    ) {
      throw new BadRequestException('Invalid organization ID format');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        type: true,
        status: true,
        memberships: {
          where: { userId },
          take: 1,
          select: {
            id: true,
            status: true,
            roleScope: true,
            role: {
              select: {
                id: true,
                code: true,
                scope: true,
                isActive: true,
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
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('Organization is not active');
    }

    const membership = organization.memberships[0];
    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }

    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('Organization membership is not active');
    }

    if (
      membership.roleScope !== RoleScope.ORGANIZATION ||
      membership.role.scope !== RoleScope.ORGANIZATION ||
      !membership.role.isActive
    ) {
      throw new ForbiddenException('Organization role is not active');
    }

    const permissions: PermissionCode[] = [];
    for (const rp of membership.role.rolePermissions) {
      if (isValidPermissionCode(rp.permission.code)) {
        permissions.push(rp.permission.code);
      }
    }

    return {
      organizationId: organization.id,
      organizationType: organization.type,
      userId,
      membershipId: membership.id,
      roleCode: membership.role.code,
      permissions,
    };
  }
}
