import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../database/prisma.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let txMock: {
    user: { findUnique: jest.Mock };
    role: { findUnique: jest.Mock };
    userSystemRole: {
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };
  let prismaMock: {
    $transaction: jest.Mock;
    user: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    txMock = {
      user: { findUnique: jest.fn() },
      role: { findUnique: jest.fn() },
      userSystemRole: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    prismaMock = {
      $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new AdminUsersService(prismaMock as unknown as PrismaService);
  });

  it('lists users without exposing sensitive auth fields', async () => {
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'user@andemta.et',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        systemRoles: [{ id: 'sr1', role: { code: 'PARTICIPANT', name: 'Participant', isActive: true } }],
      },
    ]);

    const res = await service.listUsers({ page: 1, limit: 20 });
    expect(res.items[0]).not.toHaveProperty('passwordHash');
    expect(res.items[0]).not.toHaveProperty('tokenVersion');
    expect(res.items[0].systemRoles).toEqual(['PARTICIPANT']);
  });

  it('prevents self-promotion on assignSystemRole', async () => {
    await expect(
      service.assignSystemRole('admin-1', 'admin-1', 'ADMIN'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents revoking the last platform ADMIN role', async () => {
    txMock.user.findUnique.mockResolvedValue({ id: 'other-admin' });
    txMock.role.findUnique.mockResolvedValue({ id: 'role-admin', code: 'ADMIN' });
    txMock.userSystemRole.findUnique.mockResolvedValue({ id: 'assign-1' });
    txMock.userSystemRole.count.mockResolvedValue(1);

    await expect(
      service.revokeSystemRole('actor-admin', 'other-admin', 'ADMIN'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects non-SYSTEM role codes on revokeSystemRole', async () => {
    await expect(
      service.revokeSystemRole('actor-admin', 'user-2', 'OWNER'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when target user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getUserById('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
