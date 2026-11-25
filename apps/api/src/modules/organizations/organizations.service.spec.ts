import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  RoleScope,
} from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../database/prisma.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let txMock: {
    role: { findUnique: jest.Mock };
    organization: { create: jest.Mock };
    organizationMembership: { create: jest.Mock };
  };
  let prismaMock: {
    $transaction: jest.Mock;
    organizationMembership: { count: jest.Mock; findMany: jest.Mock };
    organization: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    txMock = {
      role: { findUnique: jest.fn() },
      organization: { create: jest.fn() },
      organizationMembership: { create: jest.fn() },
    };

    prismaMock = {
      $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
      organizationMembership: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new OrganizationsService(prismaMock as unknown as PrismaService);
  });

  it('creates organization and assigns creator OWNER membership inside a single transaction', async () => {
    txMock.role.findUnique.mockResolvedValue({
      id: 'owner-role-id',
      code: 'OWNER',
      isActive: true,
    });
    txMock.organization.create.mockResolvedValue({
      id: 'org-1',
      name: 'Andemta Lab',
      slug: 'andemta-lab',
      type: OrganizationType.BUSINESS,
      status: OrganizationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txMock.organizationMembership.create.mockResolvedValue({ id: 'mem-1' });

    const result = await service.createOrganization('user-1', {
      name: 'Andemta Lab',
      slug: 'andemta-lab',
      type: OrganizationType.BUSINESS,
    });

    expect(result.roleCode).toBe('OWNER');
    expect(result.name).toBe('Andemta Lab');
    expect(txMock.organizationMembership.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        roleId: 'owner-role-id',
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.ACTIVE,
      },
    });
  });

  it('rolls back organization creation if membership creation fails', async () => {
    txMock.role.findUnique.mockResolvedValue({
      id: 'owner-role-id',
      code: 'OWNER',
      isActive: true,
    });
    txMock.organization.create.mockResolvedValue({
      id: 'org-1',
      name: 'Rollback Org',
      slug: 'rollback-org',
      type: OrganizationType.OTHER,
      status: OrganizationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    txMock.organizationMembership.create.mockRejectedValue(
      new Error('DB constraint failure'),
    );

    await expect(
      service.createOrganization('user-1', { name: 'Rollback Org' }),
    ).rejects.toThrow('DB constraint failure');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerErrorException if OWNER role is missing', async () => {
    txMock.role.findUnique.mockResolvedValue(null);

    await expect(
      service.createOrganization('user-1', { name: 'Test Org' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('lists only active organizations for the user with pagination', async () => {
    prismaMock.organizationMembership.count.mockResolvedValue(1);
    prismaMock.organizationMembership.findMany.mockResolvedValue([
      {
        role: { code: 'RESEARCHER' },
        organization: {
          id: 'org-1',
          name: 'Org 1',
          slug: 'org-1',
          type: OrganizationType.UNIVERSITY,
          status: OrganizationStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ]);

    const res = await service.listMyOrganizations('user-1', {
      page: 1,
      limit: 20,
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0].roleCode).toBe('RESEARCHER');
    expect(res.meta.total).toBe(1);
  });

  it('updates permitted fields without touching status or ownership', async () => {
    prismaMock.organization.update.mockResolvedValue({
      id: 'org-1',
      name: 'Updated Name',
      slug: 'org-1',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.updateOrganization(
      'org-1',
      { name: 'Updated Name', type: OrganizationType.UNIVERSITY },
      'ADMIN',
    );

    expect(res.name).toBe('Updated Name');
    expect(res.roleCode).toBe('ADMIN');
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Updated Name', type: OrganizationType.UNIVERSITY },
      }),
    );
  });
});
