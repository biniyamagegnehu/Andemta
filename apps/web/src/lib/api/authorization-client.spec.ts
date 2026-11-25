import {
  apiClient,
  authorizationClient,
  tokenManager,
  ApiError,
  type OrganizationAuthorizationContext,
  type SystemAuthorizationContext,
} from '@/lib/api';

describe('authorizationClient', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  it('fetches system authorization context using in-memory Bearer token', async () => {
    tokenManager.setAccessToken('access-token-sys');
    const mockCtx: SystemAuthorizationContext = {
      userId: 'user-1',
      systemRoles: ['ADMIN'],
      permissions: ['users.read', 'users.manage'],
    };

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(mockCtx);

    const res = await authorizationClient.getSystemAuthorization();

    expect(res).toEqual(mockCtx);
    expect(requestSpy).toHaveBeenCalledWith(
      '/authorization/system',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token-sys',
        }),
      }),
    );
  });

  it('fetches organization authorization context for a specific organization', async () => {
    tokenManager.setAccessToken('access-token-org');
    const mockOrgCtx: OrganizationAuthorizationContext = {
      organizationId: 'org-1',
      organizationType: 'UNIVERSITY',
      roleCode: 'RESEARCHER',
      membershipStatus: 'ACTIVE',
      permissions: ['research.read', 'research.create', 'reports.read'],
    };

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(mockOrgCtx);

    const res = await authorizationClient.getOrganizationAuthorization('org-1');

    expect(res).toEqual(mockOrgCtx);
    expect(requestSpy).toHaveBeenCalledWith(
      '/authorization/organizations/org-1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('propagates 403 Forbidden ApiError', async () => {
    tokenManager.setAccessToken('access-token-org');
    jest
      .spyOn(apiClient, 'request')
      .mockRejectedValue(new ApiError('Forbidden', 403));

    await expect(
      authorizationClient.getOrganizationAuthorization('org-2'),
    ).rejects.toThrow('Forbidden');
  });
});
