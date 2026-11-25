import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 4.8 (F) — Backend Authorization Regression (Direct API)', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  async function apiLogin(email: string, password: string): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-tracker': `e2e-login-${email}`,
      },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { accessToken: string } };
    return json.data.accessToken;
  }

  test('unauthenticated requests return 401', async ({ request }) => {
    const sysRes = await request.get(`${API_BASE_URL}/api/v1/authorization/system`);
    expect(sysRes.status()).toBe(401);

    const orgRes = await request.get(`${API_BASE_URL}/api/v1/organizations`);
    expect(orgRes.status()).toBe(401);
  });

  test('VIEWER cannot invite members and Org ADMIN cannot access /admin/users (403)', async ({
    request,
  }) => {
    const viewerToken = await apiLogin(
      fixtures.viewerUser.email,
      fixtures.viewerUser.password,
    );
    const orgAdminToken = await apiLogin(
      fixtures.orgAdminUser.email,
      fixtures.orgAdminUser.password,
    );

    const inviteRes = await request.post(
      `${API_BASE_URL}/api/v1/organizations/${fixtures.shewaFashionId}/members`,
      {
        headers: { Authorization: `Bearer ${viewerToken}` },
        data: { userId: fixtures.platformAdminUser.id, roleCode: 'VIEWER' },
      },
    );
    expect(inviteRes.status()).toBe(403);

    const adminUsersRes = await request.get(
      `${API_BASE_URL}/api/v1/admin/users`,
      {
        headers: { Authorization: `Bearer ${orgAdminToken}` },
      },
    );
    expect(adminUsersRes.status()).toBe(403);
  });

  test('cross-organization access is rejected (403) and client-supplied role on org creation is rejected (400)', async ({
    request,
  }) => {
    const biniyamToken = await apiLogin(
      fixtures.biniyam.email,
      fixtures.biniyam.password,
    );

    const unrelatedRes = await request.get(
      `${API_BASE_URL}/api/v1/authorization/organizations/${fixtures.unrelatedOrgId}`,
      {
        headers: { Authorization: `Bearer ${biniyamToken}` },
      },
    );
    expect(unrelatedRes.status()).toBe(403);

    const spoofedOrgRes = await request.post(
      `${API_BASE_URL}/api/v1/organizations`,
      {
        headers: { Authorization: `Bearer ${biniyamToken}` },
        data: { name: 'Spoofed Org', role: 'ADMIN' },
      },
    );
    expect(spoofedOrgRes.status()).toBe(400);
  });
});
