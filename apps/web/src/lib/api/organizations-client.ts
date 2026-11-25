import { authenticatedRequest } from './auth-client';
import type { PaginatedOrganizationsData } from './types';

export interface ListMyOrganizationsParams {
  page?: number;
  limit?: number;
}

/**
 * Client for Phase 4.5 Organization endpoints.
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
};
