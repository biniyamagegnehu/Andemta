import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationType,
  RoleScope,
} from '@prisma/client';
import { OrganizationMembersService } from './organization-members.service';
import { PrismaService } from '../../database/prisma.service';
import { OrganizationContext } from '../rbac';

describe('OrganizationMembersService', () => {
  let service: OrganizationMembersService;
  let txMock: {
    user: { findUnique: jest.Mock };
    role: { findUnique: jest.Mock };
    organizationMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let prismaMock: {
    $transaction: jest.Mock;
    organizationMembership: { count: jest.Mock; findMany: jest.Mock };
  };

  const ownerCtx: OrganizationContext = {
    organizationId: 'org-1',
    organizationType: OrganizationType.BUSINESS,
    userId: 'owner-user',
    membershipId: 'mem-owner',
    roleCode: 'OWNER',
    permissions: [],
  };

  const adminCtx: OrganizationContext = {
    ...ownerCtx,
    userId: 'admin-user',
    membershipId: 'mem-admin',
    roleCode: 'ADMIN',
  };

  beforeEach(() => {
    txMock = {
      user: { findUnique: jest.fn() },
      role: { findUnique: jest.fn() },
      organizationMembership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prismaMock = {
      $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
      organizationMembership: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new OrganizationMembersService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('addMember', () => {
    it('prevents Organization ADMIN from adding a member with OWNER role', async () => {
      await expect(
        service.addMember(adminCtx, { userId: 'target-1', roleCode: 'OWNER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects duplicate active membership with 409 Conflict', async () => {
      txMock.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'target@andemta.et',
      });
      txMock.role.findUnique.mockResolvedValue({
        id: 'role-res',
        code: 'RESEARCHER',
        scope: RoleScope.ORGANIZATION,
        isActive: true,
      });
      txMock.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-existing',
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.addMember(ownerCtx, {
          userId: 'target-1',
          roleCode: 'RESEARCHER',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects inactive or non-ORGANIZATION role', async () => {
      txMock.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'target@andemta.et',
      });
      txMock.role.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember(ownerCtx, {
          userId: 'target-1',
          roleCode: 'RESEARCHER',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changeMemberRole', () => {
    it('rejects cross-organization membership IDs with 404 NotFoundException', async () => {
      txMock.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.changeMemberRole(ownerCtx, 'foreign-mem-id', {
          roleCode: 'VIEWER',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents self role modification', async () => {
      txMock.organizationMembership.findFirst.mockResolvedValue({
        id: ownerCtx.membershipId,
        organizationId: ownerCtx.organizationId,
        userId: ownerCtx.userId,
        status: MembershipStatus.ACTIVE,
        user: { email: 'owner@andemta.et' },
        role: { id: 'r1', code: 'OWNER' },
      });

      await expect(
        service.changeMemberRole(ownerCtx, ownerCtx.membershipId, {
          roleCode: 'ADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Organization ADMIN from promoting someone to OWNER', async () => {
      txMock.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-2',
        organizationId: adminCtx.organizationId,
        userId: 'user-2',
        status: MembershipStatus.ACTIVE,
        user: { email: 'u2@andemta.et' },
        role: { id: 'r-res', code: 'RESEARCHER' },
      });

      await expect(
        service.changeMemberRole(adminCtx, 'mem-2', { roleCode: 'OWNER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents demoting the last OWNER', async () => {
      const secondOwnerCtx: OrganizationContext = {
        ...ownerCtx,
        userId: 'other-owner',
        membershipId: 'mem-other-owner',
      };
      txMock.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-last-owner',
        organizationId: ownerCtx.organizationId,
        userId: 'last-owner',
        status: MembershipStatus.ACTIVE,
        user: { email: 'owner@andemta.et' },
        role: { id: 'r-owner', code: 'OWNER' },
      });
      txMock.organizationMembership.count.mockResolvedValue(1);

      await expect(
        service.changeMemberRole(secondOwnerCtx, 'mem-last-owner', {
          roleCode: 'ADMIN',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeMember', () => {
    it('prevents removing the last OWNER', async () => {
      txMock.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-owner',
        status: MembershipStatus.ACTIVE,
        role: { code: 'OWNER' },
      });
      txMock.organizationMembership.count.mockResolvedValue(1);

      await expect(
        service.removeMember(ownerCtx, 'mem-owner'),
      ).rejects.toThrow(ConflictException);
    });

    it('soft-deactivates membership to INACTIVE instead of deleting record', async () => {
      txMock.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-res',
        status: MembershipStatus.ACTIVE,
        role: { code: 'RESEARCHER' },
      });
      txMock.organizationMembership.update.mockResolvedValue({
        id: 'mem-res',
        status: MembershipStatus.INACTIVE,
      });

      const res = await service.removeMember(ownerCtx, 'mem-res');
      expect(res.status).toBe(MembershipStatus.INACTIVE);
      expect(txMock.organizationMembership.update).toHaveBeenCalledWith({
        where: { id: 'mem-res' },
        data: { status: MembershipStatus.INACTIVE },
        select: { id: true, status: true },
      });
    });
  });
});
