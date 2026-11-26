import {
  apiClient,
  organizationsClient,
  tokenManager,
  ApiError,
  type PaginatedOrganizationsData,
  type UserOrganization,
} from '@/lib/api';

describe('organizationsClient', () => {
  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  const sampleOrg: UserOrganization = {
    id: 'org-1',
    name: 'Addis Insights',
    slug: 'addis-insights',
    type: 'BUSINESS',
    status: 'ACTIVE',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    roleCode: 'OWNER',
  };

  it('fetches authenticated user organizations using in-memory Bearer token', async () => {
    tokenManager.setAccessToken('in-memory-access-token');

    const mockData: PaginatedOrganizationsData = {
      items: [sampleOrg],
      meta: {
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      },
    };

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(mockData);

    const result = await organizationsClient.listMyOrganizations();

    expect(result).toEqual(mockData);
    expect(requestSpy).toHaveBeenCalledWith(
      '/organizations',
      expect.objectContaining({
        method: 'GET',
        params: { page: 1, limit: 50 },
        headers: expect.objectContaining({
          Authorization: 'Bearer in-memory-access-token',
        }),
      }),
    );
  });

  it('creates an organization via POST /organizations without sending role or status', async () => {
    tokenManager.setAccessToken('in-memory-access-token');

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(sampleOrg);

    const result = await organizationsClient.createOrganization({
      name: 'Addis Insights',
      slug: 'addis-insights',
      type: 'BUSINESS',
    });

    expect(result).toEqual(sampleOrg);
    expect(requestSpy).toHaveBeenCalledWith(
      '/organizations',
      expect.objectContaining({
        method: 'POST',
        body: {
          name: 'Addis Insights',
          slug: 'addis-insights',
          type: 'BUSINESS',
        },
        headers: expect.objectContaining({
          Authorization: 'Bearer in-memory-access-token',
        }),
      }),
    );
  });

  it('fetches a single organization via GET /organizations/:organizationId', async () => {
    tokenManager.setAccessToken('in-memory-access-token');

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(sampleOrg);

    const result = await organizationsClient.getOrganization('org-1');

    expect(result).toEqual(sampleOrg);
    expect(requestSpy).toHaveBeenCalledWith(
      '/organizations/org-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer in-memory-access-token',
        }),
      }),
    );
  });

  it('updates an organization via PATCH /organizations/:organizationId', async () => {
    tokenManager.setAccessToken('in-memory-access-token');
    const updatedOrg: UserOrganization = {
      ...sampleOrg,
      name: 'Addis Insights Updated',
      type: 'UNIVERSITY',
    };

    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(updatedOrg);

    const result = await organizationsClient.updateOrganization('org-1', {
      name: 'Addis Insights Updated',
      type: 'UNIVERSITY',
    });

    expect(result).toEqual(updatedOrg);
    expect(requestSpy).toHaveBeenCalledWith(
      '/organizations/org-1',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          name: 'Addis Insights Updated',
          type: 'UNIVERSITY',
        },
        headers: expect.objectContaining({
          Authorization: 'Bearer in-memory-access-token',
        }),
      }),
    );
  });

  it('propagates ApiError when backend request fails', async () => {
    tokenManager.setAccessToken('in-memory-access-token');
    jest
      .spyOn(apiClient, 'request')
      .mockRejectedValue(new ApiError('Forbidden', 403));

    await expect(organizationsClient.getOrganization('org-1')).rejects.toThrow(
      'Forbidden',
    );
  });
});
