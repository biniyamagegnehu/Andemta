import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const sampleProfile = {
    id: '11111111-2222-4333-8444-555555555555',
    email: 'biniyam@andemta.et',
    emailVerifiedAt: new Date('2026-11-20T00:00:00.000Z'),
    fullName: 'Biniyam Tesfaye',
    phoneNumber: '+251911223344',
    preferredLanguage: 'en',
    bio: 'Consumer research lead.',
    createdAt: new Date('2026-11-20T00:00:00.000Z'),
    updatedAt: new Date('2026-11-25T00:00:00.000Z'),
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new UsersService(prismaMock as unknown as PrismaService);
  });

  describe('getMyProfile', () => {
    it('returns safe profile fields without sensitive auth fields', async () => {
      prismaMock.user.findUnique.mockResolvedValue(sampleProfile);

      const res = await service.getMyProfile(sampleProfile.id);

      expect(res).toEqual(sampleProfile);
      expect(res).not.toHaveProperty('passwordHash');
      expect(res).not.toHaveProperty('tokenVersion');
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: sampleProfile.id },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          fullName: true,
          phoneNumber: true,
          preferredLanguage: true,
          bio: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateMyProfile', () => {
    it('updates only permitted profile fields for authenticated userId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: sampleProfile.id });
      const updated = {
        ...sampleProfile,
        fullName: 'Biniyam T.',
        preferredLanguage: 'am',
      };
      prismaMock.user.update.mockResolvedValue(updated);

      const res = await service.updateMyProfile(sampleProfile.id, {
        fullName: 'Biniyam T.',
        preferredLanguage: 'am',
      });

      expect(res.fullName).toBe('Biniyam T.');
      expect(res.preferredLanguage).toBe('am');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleProfile.id },
          data: {
            fullName: 'Biniyam T.',
            preferredLanguage: 'am',
          },
        }),
      );
    });

    it('allows clearing nullable fields with null', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: sampleProfile.id });
      prismaMock.user.update.mockResolvedValue({
        ...sampleProfile,
        phoneNumber: null,
        bio: null,
      });

      const res = await service.updateMyProfile(sampleProfile.id, {
        phoneNumber: null,
        bio: null,
      });

      expect(res.phoneNumber).toBeNull();
      expect(res.bio).toBeNull();
    });

    it('throws NotFoundException if authenticated user no longer exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMyProfile('missing-id', { fullName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });
});
