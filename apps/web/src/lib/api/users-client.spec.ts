import {
  apiClient,
  usersClient,
  tokenManager,
  ApiError,
  type UserProfile,
} from '@/lib/api';

describe('usersClient', () => {
  const sampleProfile: UserProfile = {
    id: 'user-1',
    email: 'biniyam@andemta.et',
    emailVerifiedAt: '2026-11-20T00:00:00.000Z',
    fullName: 'Biniyam Tesfaye',
    phoneNumber: '+251911223344',
    preferredLanguage: 'en',
    bio: 'Researcher',
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
  };

  beforeEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    tokenManager.clearAccessToken();
    jest.restoreAllMocks();
  });

  it('getMyProfile fetches /users/me using in-memory Bearer token', async () => {
    tokenManager.setAccessToken('jwt-profile-token');
    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(sampleProfile);

    const res = await usersClient.getMyProfile();

    expect(res).toEqual(sampleProfile);
    expect(requestSpy).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-profile-token',
        }),
      }),
    );
  });

  it('updateMyProfile sends PATCH /users/me with only supported fields', async () => {
    tokenManager.setAccessToken('jwt-profile-token');
    const updated = { ...sampleProfile, fullName: 'Biniyam T.', preferredLanguage: 'am' as const };
    const requestSpy = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue(updated);

    const res = await usersClient.updateMyProfile({
      fullName: 'Biniyam T.',
      preferredLanguage: 'am',
    });

    expect(res).toEqual(updated);
    expect(requestSpy).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({
        method: 'PATCH',
        body: { fullName: 'Biniyam T.', preferredLanguage: 'am' },
      }),
    );
  });

  it('propagates 400 validation ApiError on invalid update', async () => {
    tokenManager.setAccessToken('jwt-profile-token');
    jest
      .spyOn(apiClient, 'request')
      .mockRejectedValue(
        new ApiError('Validation failed', 400, [
          { field: 'phoneNumber', message: 'Invalid phone number' },
        ]),
      );

    await expect(
      usersClient.updateMyProfile({ phoneNumber: 'bad' }),
    ).rejects.toThrow('Validation failed');
  });
});
