import { authenticatedRequest } from './auth-client';
import type { UpdateProfileDto, UserProfile } from './types';

/**
 * Client for Phase 5.1 User Profile Management endpoints.
 * Reuses authenticatedRequest (in-memory Bearer token + single-flight 401 refresh).
 */
export const usersClient = {
  async getMyProfile(): Promise<UserProfile> {
    return authenticatedRequest<UserProfile>('/users/me', {
      method: 'GET',
    });
  },

  async updateMyProfile(dto: UpdateProfileDto): Promise<UserProfile> {
    return authenticatedRequest<UserProfile>('/users/me', {
      method: 'PATCH',
      body: dto,
    });
  },
};
