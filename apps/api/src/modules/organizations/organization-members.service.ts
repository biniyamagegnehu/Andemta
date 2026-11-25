import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, RoleScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OrganizationContext } from '../rbac';
import {
  AddOrganizationMemberDto,
  UpdateMemberRoleDto,
} from './dto/membership.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

export interface SafeOrganizationMemberDto {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  roleCode: string;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrganizationMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists active members of the validated organization.
   * Never exposes password hashes, token versions, or session secrets.
   */
  async listMembers(organizationId: string, query: PaginationQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      status: MembershipStatus.ACTIVE,
    };

    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              email: true,
            },
          },
          role: {
            select: {
              code: true,
            },
          },
        },
      }),
    ]);

    return {
      items: memberships.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        userId: m.userId,
        email: m.user.email,
        roleCode: m.role.code,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Adds an existing user to the organization with a validated ORGANIZATION role.
   *
   * Security rules:
   * - Only OWNER may assign the OWNER role (prevents ADMIN -> OWNER escalation).
   * - Target user must exist.
   * - Target role must exist, be active, and belong to RoleScope.ORGANIZATION.
   * - Duplicate active memberships are rejected with 409 Conflict.
   */
  async addMember(
    orgContext: OrganizationContext,
    dto: AddOrganizationMemberDto,
  ): Promise<SafeOrganizationMemberDto> {
    if (dto.roleCode === 'OWNER' && orgContext.roleCode !== 'OWNER') {
      throw new ForbiddenException(
        'Only an organization OWNER can assign the OWNER role',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, email: true },
      });

      if (!targetUser) {
        throw new NotFoundException('Target user not found');
      }

      const targetRole = await tx.role.findUnique({
        where: {
          scope_code: {
            scope: RoleScope.ORGANIZATION,
            code: dto.roleCode,
          },
        },
        select: { id: true, code: true, scope: true, isActive: true },
      });

      if (
        !targetRole ||
        !targetRole.isActive ||
        targetRole.scope !== RoleScope.ORGANIZATION
      ) {
        throw new BadRequestException(
          'Requested organization role is invalid or inactive',
        );
      }

      const existing = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: dto.userId,
            organizationId: orgContext.organizationId,
          },
        },
        select: { id: true, status: true },
      });

      if (existing && existing.status === MembershipStatus.ACTIVE) {
        throw new ConflictException(
          'User is already an active member of this organization',
        );
      }

      const membership = existing
        ? await tx.organizationMembership.update({
            where: { id: existing.id },
            data: {
              roleId: targetRole.id,
              roleScope: RoleScope.ORGANIZATION,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              id: true,
              organizationId: true,
              userId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await tx.organizationMembership.create({
            data: {
              organizationId: orgContext.organizationId,
              userId: dto.userId,
              roleId: targetRole.id,
              roleScope: RoleScope.ORGANIZATION,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              id: true,
              organizationId: true,
              userId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          });

      return {
        ...membership,
        email: targetUser.email,
        roleCode: targetRole.code,
      };
    });
  }

  /**
   * Changes an existing active member's role within the organization.
   *
   * Security rules:
   * - Membership must belong to orgContext.organizationId (prevents IDOR).
   * - Users cannot change their own role.
   * - Only OWNER can promote to OWNER or modify an existing OWNER.
   * - Cannot demote the final active OWNER of an organization.
   */
  async changeMemberRole(
    orgContext: OrganizationContext,
    membershipId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<SafeOrganizationMemberDto> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: orgContext.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          status: true,
          user: { select: { email: true } },
          role: { select: { id: true, code: true } },
        },
      });

      if (!membership) {
        throw new NotFoundException('Organization membership not found');
      }

      if (membership.status !== MembershipStatus.ACTIVE) {
        throw new ConflictException(
          'Cannot change the role of an inactive membership',
        );
      }

      if (membership.userId === orgContext.userId) {
        throw new ForbiddenException(
          'You cannot modify your own organization role',
        );
      }

      if (
        (dto.roleCode === 'OWNER' || membership.role.code === 'OWNER') &&
        orgContext.roleCode !== 'OWNER'
      ) {
        throw new ForbiddenException(
          'Only an organization OWNER can assign or modify OWNER roles',
        );
      }

      if (membership.role.code === 'OWNER' && dto.roleCode !== 'OWNER') {
        const activeOwnerCount = await tx.organizationMembership.count({
          where: {
            organizationId: orgContext.organizationId,
            status: MembershipStatus.ACTIVE,
            role: {
              scope: RoleScope.ORGANIZATION,
              code: 'OWNER',
            },
          },
        });

        if (activeOwnerCount <= 1) {
          throw new ConflictException(
            'Cannot demote the last owner of the organization',
          );
        }
      }

      const targetRole = await tx.role.findUnique({
        where: {
          scope_code: {
            scope: RoleScope.ORGANIZATION,
            code: dto.roleCode,
          },
        },
        select: { id: true, code: true, scope: true, isActive: true },
      });

      if (
        !targetRole ||
        !targetRole.isActive ||
        targetRole.scope !== RoleScope.ORGANIZATION
      ) {
        throw new BadRequestException(
          'Requested organization role is invalid or inactive',
        );
      }

      const updated = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          roleId: targetRole.id,
          roleScope: RoleScope.ORGANIZATION,
        },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...updated,
        email: membership.user.email,
        roleCode: targetRole.code,
      };
    });
  }

  /**
   * Deactivates an organization membership (preserving historical records).
   * Access is revoked immediately because OrganizationAuthorizationService
   * requires MembershipStatus.ACTIVE.
   *
   * Protects against removing the final OWNER or non-OWNER removing an OWNER.
   */
  async removeMember(
    orgContext: OrganizationContext,
    membershipId: string,
  ): Promise<{ id: string; status: MembershipStatus }> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: orgContext.organizationId,
        },
        select: {
          id: true,
          status: true,
          role: { select: { code: true } },
        },
      });

      if (!membership) {
        throw new NotFoundException('Organization membership not found');
      }

      if (membership.status !== MembershipStatus.ACTIVE) {
        throw new ConflictException('Membership is already inactive');
      }

      if (membership.role.code === 'OWNER') {
        if (orgContext.roleCode !== 'OWNER') {
          throw new ForbiddenException(
            'Only an organization OWNER can remove an OWNER',
          );
        }

        const activeOwnerCount = await tx.organizationMembership.count({
          where: {
            organizationId: orgContext.organizationId,
            status: MembershipStatus.ACTIVE,
            role: {
              scope: RoleScope.ORGANIZATION,
              code: 'OWNER',
            },
          },
        });

        if (activeOwnerCount <= 1) {
          throw new ConflictException(
            'Cannot remove the last owner of the organization',
          );
        }
      }

      const updated = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.INACTIVE },
        select: { id: true, status: true },
      });

      return updated;
    });
  }
}
