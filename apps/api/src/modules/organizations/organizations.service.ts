import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  RoleScope,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

export interface SafeOrganizationDto {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
  roleCode?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildSlug(name: string, requestedSlug?: string): string {
    if (requestedSlug) {
      return requestedSlug;
    }
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const suffix = randomBytes(3).toString('hex');
    return `${base || 'org'}-${suffix}`;
  }

  /**
   * Creates an organization and assigns the creator the OWNER role
   * atomically within a single database transaction.
   */
  async createOrganization(
    creatorUserId: string,
    dto: CreateOrganizationDto,
  ): Promise<SafeOrganizationDto> {
    const slug = this.buildSlug(dto.name, dto.slug);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ownerRole = await tx.role.findUnique({
          where: {
            scope_code: {
              scope: RoleScope.ORGANIZATION,
              code: 'OWNER',
            },
          },
          select: { id: true, code: true, isActive: true },
        });

        if (!ownerRole || !ownerRole.isActive) {
          throw new InternalServerErrorException(
            'Organization OWNER role is not available',
          );
        }

        const organization = await tx.organization.create({
          data: {
            name: dto.name,
            slug,
            type: dto.type ?? OrganizationType.OTHER,
            status: OrganizationStatus.ACTIVE,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: creatorUserId,
            roleId: ownerRole.id,
            roleScope: RoleScope.ORGANIZATION,
            status: MembershipStatus.ACTIVE,
          },
        });

        return {
          ...organization,
          roleCode: ownerRole.code,
        };
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this slug already exists',
        );
      }
      throw error;
    }
  }

  /**
   * Lists only active organizations where the authenticated user holds an active membership.
   */
  async listMyOrganizations(userId: string, query: PaginationQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: MembershipStatus.ACTIVE,
      organization: {
        status: OrganizationStatus.ACTIVE,
      },
      role: {
        isActive: true,
        scope: RoleScope.ORGANIZATION,
      },
    };

    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          role: {
            select: { code: true },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      items: memberships.map((m) => ({
        ...m.organization,
        roleCode: m.role.code,
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
   * Returns safe details for an organization already validated by OrganizationAuthGuard.
   */
  async getOrganizationDetails(
    organizationId: string,
    roleCode: string,
  ): Promise<SafeOrganizationDto> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      ...organization,
      roleCode,
    };
  }

  /**
   * Updates permitted organization fields (name, type).
   * Status and ownership cannot be modified through this endpoint.
   */
  async updateOrganization(
    organizationId: string,
    dto: UpdateOrganizationDto,
    roleCode: string,
  ): Promise<SafeOrganizationDto> {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...updated,
      roleCode,
    };
  }
}
