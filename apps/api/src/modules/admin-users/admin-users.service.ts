import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ALLOWED_SYSTEM_ROLE_CODES,
  ListAdminUsersQueryDto,
  SystemRoleCode,
} from './dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists platform users with pagination and safe filtering.
   * Never exposes passwordHash, tokenVersion, sessions, or verification/reset tokens.
   */
  async listUsers(query: ListAdminUsersQueryDto) {
    const { page, limit, email, emailVerified } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (email) {
      where.email = { contains: email, mode: 'insensitive' };
    }
    if (emailVerified === true) {
      where.emailVerifiedAt = { not: null };
    } else if (emailVerified === false) {
      where.emailVerifiedAt = null;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          systemRoles: {
            select: {
              id: true,
              role: {
                select: {
                  code: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        email: u.email,
        emailVerifiedAt: u.emailVerifiedAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        systemRoles: u.systemRoles.map((sr) => sr.role.code),
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
   * Returns safe user details for platform administrators.
   * Never exposes authentication secrets or private session hashes.
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        systemRoles: {
          select: {
            id: true,
            createdAt: true,
            role: {
              select: {
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
        organizationMemberships: {
          select: {
            id: true,
            status: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      systemRoles: user.systemRoles.map((sr) => ({
        assignmentId: sr.id,
        code: sr.role.code,
        name: sr.role.name,
        isActive: sr.role.isActive,
        assignedAt: sr.createdAt,
      })),
      organizationMemberships: user.organizationMemberships.map((m) => ({
        membershipId: m.id,
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        organizationStatus: m.organization.status,
        roleCode: m.role.code,
        status: m.status,
      })),
    };
  }

  /**
   * Assigns a built-in SYSTEM role to a target user.
   * Prevents self-modification and organization-scope crossover.
   */
  async assignSystemRole(
    actorUserId: string,
    targetUserId: string,
    roleCode: SystemRoleCode,
  ) {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException(
        'Administrators cannot modify their own system roles',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }

      const role = await tx.role.findUnique({
        where: {
          scope_code: {
            scope: RoleScope.SYSTEM,
            code: roleCode,
          },
        },
        select: { id: true, code: true, scope: true, isActive: true },
      });

      if (!role || !role.isActive || role.scope !== RoleScope.SYSTEM) {
        throw new BadRequestException(
          'Requested system role is invalid or inactive',
        );
      }

      const existing = await tx.userSystemRole.findUnique({
        where: {
          userId_roleId: {
            userId: targetUserId,
            roleId: role.id,
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          `User already holds system role "${roleCode}"`,
        );
      }

      const assignment = await tx.userSystemRole.create({
        data: {
          userId: targetUserId,
          roleId: role.id,
          roleScope: RoleScope.SYSTEM,
        },
        select: {
          id: true,
          userId: true,
          roleScope: true,
          createdAt: true,
        },
      });

      this.logger.log(
        `[AUDIT] Admin ${actorUserId} assigned SYSTEM role ${roleCode} to user ${targetUserId}`,
      );

      return {
        assignmentId: assignment.id,
        userId: assignment.userId,
        roleCode: role.code,
        roleScope: assignment.roleScope,
        createdAt: assignment.createdAt,
      };
    });
  }

  /**
   * Revokes a SYSTEM role from a target user.
   * Prevents self-revocation and protects against removing the last platform ADMIN.
   */
  async revokeSystemRole(
    actorUserId: string,
    targetUserId: string,
    rawRoleCode: string,
  ) {
    const roleCode = rawRoleCode.trim().toUpperCase();
    if (!ALLOWED_SYSTEM_ROLE_CODES.includes(roleCode as SystemRoleCode)) {
      throw new BadRequestException(
        'roleCode must be one of PARTICIPANT, ADMIN',
      );
    }

    if (actorUserId === targetUserId) {
      throw new ForbiddenException(
        'Administrators cannot modify their own system roles',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }

      const role = await tx.role.findUnique({
        where: {
          scope_code: {
            scope: RoleScope.SYSTEM,
            code: roleCode,
          },
        },
        select: { id: true, code: true },
      });

      if (!role) {
        throw new NotFoundException('System role not found');
      }

      const assignment = await tx.userSystemRole.findUnique({
        where: {
          userId_roleId: {
            userId: targetUserId,
            roleId: role.id,
          },
        },
        select: { id: true },
      });

      if (!assignment) {
        throw new NotFoundException(
          `User does not hold system role "${roleCode}"`,
        );
      }

      if (roleCode === 'ADMIN') {
        const adminCount = await tx.userSystemRole.count({
          where: {
            roleScope: RoleScope.SYSTEM,
            role: {
              scope: RoleScope.SYSTEM,
              code: 'ADMIN',
              isActive: true,
            },
          },
        });

        if (adminCount <= 1) {
          throw new ConflictException(
            'Cannot revoke the last platform administrator role',
          );
        }
      }

      await tx.userSystemRole.delete({
        where: { id: assignment.id },
      });

      this.logger.log(
        `[AUDIT] Admin ${actorUserId} revoked SYSTEM role ${roleCode} from user ${targetUserId}`,
      );

      return {
        userId: targetUserId,
        roleCode,
        revoked: true,
      };
    });
  }
}
