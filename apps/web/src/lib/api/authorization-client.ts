import { authenticatedRequest } from './auth-client';
import type {
  OrganizationAuthorizationContext,
  SystemAuthorizationContext,
} from './types';

/**
 * Client for read-only backend authorization context endpoints (Phase 4.7).
 * Uses authenticatedRequest so in-memory Bearer token and single-flight refresh are reused.
 */
export const authorizationClient = {
  async getSystemAuthorization(): Promise<SystemAuthorizationContext> {
    return authenticatedRequest<SystemAuthorizationContext>(
      '/authorization/system',
      { method: 'GET' },
    );
  },

  async getOrganizationAuthorization(
    organizationId: string,
  ): Promise<OrganizationAuthorizationContext> {
    return authenticatedRequest<OrganizationAuthorizationContext>(
      `/authorization/organizations/${encodeURIComponent(organizationId)}`,
      { method: 'GET' },
    );
  },
};
