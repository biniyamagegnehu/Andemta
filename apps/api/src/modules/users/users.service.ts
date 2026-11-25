import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface SafeUserProfile {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  fullName: string | null;
  phoneNumber: string | null;
  preferredLanguage: string;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SAFE_PROFILE_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  fullName: true,
  phoneNumber: true,
  preferredLanguage: true,
  bio: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the authenticated user's safe profile from PostgreSQL.
   * Never selects or returns passwordHash, tokenVersion, or token/session relations.
   */
  async getMyProfile(userId: string): Promise<SafeUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  /**
   * Updates only explicitly permitted self-service profile fields for `userId`.
   * Target user is always resolved from authenticated JWT context, never request body.
   */
  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<SafeUserProfile> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('User profile not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phoneNumber !== undefined
          ? { phoneNumber: dto.phoneNumber }
          : {}),
        ...(dto.preferredLanguage !== undefined
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      },
      select: SAFE_PROFILE_SELECT,
    });
  }
}
