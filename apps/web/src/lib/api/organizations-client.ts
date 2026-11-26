import { authenticatedRequest } from './auth-client';
import type {
  CreateOrganizationDto,
  PaginatedOrganizationsData,
  UpdateOrganizationDto,
  UserOrganization,
} from './types';

export interface ListMyOrganizationsParams {
  page?: number;
  limit?: number;
}

/**
 * Client for Phase 4.5 / 5.2 Organization endpoints.
 * Uses authenticatedRequest so in-memory Bearer token and single-flight refresh are reused.
 */
export const organizationsClient = {
  async listMyOrganizations(
    params: ListMyOrganizationsParams = {},
  ): Promise<PaginatedOrganizationsData> {
    return authenticatedRequest<PaginatedOrganizationsData>('/organizations', {
      method: 'GET',
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    });
  },

  async createOrganization(
    dto: CreateOrganizationDto,
  ): Promise<UserOrganization> {
    return authenticatedRequest<UserOrganization>('/organizations', {
      method: 'POST',
      body: dto,
    });
  },

  async getOrganization(organizationId: string): Promise<UserOrganization> {
    return authenticatedRequest<UserOrganization>(
      `/organizations/${encodeURIComponent(organizationId)}`,
      {
        method: 'GET',
      },
    );
  },

  async updateOrganization(
    organizationId: string,
    dto: UpdateOrganizationDto,
  ): Promise<UserOrganization> {
    return authenticatedRequest<UserOrganization>(
      `/organizations/${encodeURIComponent(organizationId)}`,
      {
        method: 'PATCH',
        body: dto,
      },
    );
  },
};
