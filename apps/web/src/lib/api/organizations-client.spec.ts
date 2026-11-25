import {
  apiClient,
  organizationsClient,
  tokenManager,
  ApiError,
  type PaginatedOrganizationsData,
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

  it('fetches authenticated user organizations using in-memory Bearer token', async () => {
    tokenManager.setAccessToken('in-memory-access-token');

    const mockData: PaginatedOrganizationsData = {
      items: [
        {
          id: 'org-1',
          name: 'Addis Insights',
          slug: 'addis-insights',
          type: 'BUSINESS',
          status: 'ACTIVE',
          createdAt: '2026-11-25T00:00:00.000Z',
          updatedAt: '2026-11-25T00:00:00.000Z',
          roleCode: 'OWNER',
        },
      ],
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

  it('propagates ApiError when backend request fails', async () => {
    tokenManager.setAccessToken('in-memory-access-token');
    jest
      .spyOn(apiClient, 'request')
      .mockRejectedValue(new ApiError('Internal server error', 500));

    await expect(organizationsClient.listMyOrganizations()).rejects.toThrow(
      'Internal server error',
    );
  });
});
