import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  RoleScope,
} from '@prisma/client';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSION } from '../constants/permissions';

describe('OrganizationAuthorizationService', () => {
  let service: OrganizationAuthorizationService;
  let prismaMock: {
    organization: {
      findUnique: jest.Mock;
    };
  };

  const validOrgId = '11111111-2222-4333-8444-555555555555';
  const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
      },
    };
    service = new OrganizationAuthorizationService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('extractOrganizationIdFromParams', () => {
    it('extracts organizationId from params', () => {
      expect(
        service.extractOrganizationIdFromParams({ organizationId: validOrgId }),
      ).toBe(validOrgId);
    });

    it('extracts orgId fallback from params', () => {
      expect(
        service.extractOrganizationIdFromParams({ orgId: validOrgId }),
      ).toBe(validOrgId);
    });

    it('throws ForbiddenException when organizationId is missing', () => {
      expect(() => service.extractOrganizationIdFromParams({})).toThrow(
        ForbiddenException,
      );
      expect(() => service.extractOrganizationIdFromParams(undefined)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('validateOrganizationAccess', () => {
    it('throws BadRequestException for malformed organization ID', async () => {
      await expect(
        service.validateOrganizationAccess(userId, 'not-a-uuid'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when organization does not exist', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.validateOrganizationAccess(userId, validOrgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when organization is SUSPENDED or INACTIVE', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: validOrgId,
        type: OrganizationType.BUSINESS,
        status: OrganizationStatus.SUSPENDED,
        memberships: [],
      });

      await expect(
        service.validateOrganizationAccess(userId, validOrgId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user has no membership in organization', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: validOrgId,
        type: OrganizationType.BUSINESS,
        status: OrganizationStatus.ACTIVE,
        memberships: [],
      });

      await expect(
        service.validateOrganizationAccess(userId, validOrgId),
      ).rejects.toThrow(ForbiddenException);
    });

    it.each([
      MembershipStatus.SUSPENDED,
      MembershipStatus.INVITED,
      MembershipStatus.INACTIVE,
    ])('throws ForbiddenException when membership status is %s', async (status) => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: validOrgId,
        type: OrganizationType.BUSINESS,
        status: OrganizationStatus.ACTIVE,
        memberships: [
          {
            id: 'mem-1',
            status,
            roleScope: RoleScope.ORGANIZATION,
            role: {
              id: 'role-1',
              code: 'RESEARCHER',
              scope: RoleScope.ORGANIZATION,
              isActive: true,
              rolePermissions: [],
            },
          },
        ],
      });

      await expect(
        service.validateOrganizationAccess(userId, validOrgId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when organization role is inactive', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: validOrgId,
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
        memberships: [
          {
            id: 'mem-1',
            status: MembershipStatus.ACTIVE,
            roleScope: RoleScope.ORGANIZATION,
            role: {
              id: 'role-1',
              code: 'RESEARCHER',
              scope: RoleScope.ORGANIZATION,
              isActive: false,
              rolePermissions: [
                { permission: { code: PERMISSION.RESEARCH_READ } },
              ],
            },
          },
        ],
      });

      await expect(
        service.validateOrganizationAccess(userId, validOrgId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns typed OrganizationContext for active org and active membership', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: validOrgId,
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
        memberships: [
          {
            id: 'mem-1',
            status: MembershipStatus.ACTIVE,
            roleScope: RoleScope.ORGANIZATION,
            role: {
              id: 'role-1',
              code: 'RESEARCHER',
              scope: RoleScope.ORGANIZATION,
              isActive: true,
              rolePermissions: [
                { permission: { code: PERMISSION.RESEARCH_CREATE } },
                { permission: { code: PERMISSION.RESEARCH_READ } },
              ],
            },
          },
        ],
      });

      const context = await service.validateOrganizationAccess(
        userId,
        validOrgId,
      );

      expect(context).toEqual({
        organizationId: validOrgId,
        organizationType: OrganizationType.UNIVERSITY,
        userId,
        membershipId: 'mem-1',
        roleCode: 'RESEARCHER',
        permissions: [PERMISSION.RESEARCH_CREATE, PERMISSION.RESEARCH_READ],
      });
    });
  });
});
