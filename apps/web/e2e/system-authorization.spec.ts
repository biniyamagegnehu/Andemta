import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 4.8 (B) — System-Level Authorization', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('Organization ADMIN cannot see Admin Users nav item and receives 403 UI on /admin/users', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.orgAdminUser, '/dashboard');

    const sidebar = page.getByRole('navigation').first();
    await expect(sidebar.getByRole('link', { name: 'Admin Users' })).toHaveCount(
      0,
    );

    // Direct navigation to /admin/users must show Access Denied (403)
    await page.goto('/admin/users');
    await expect(
      page.getByRole('heading', { name: 'Access Denied (403)' }),
    ).toBeVisible();
  });

  test('Platform ADMIN sees Admin Users in sidebar, accesses /admin/users, and sees no org permissions without membership', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.platformAdminUser, '/dashboard');

    await expect(
      page.getByRole('link', { name: 'Admin Users' }).first(),
    ).toBeVisible();

    // Platform ADMIN without org membership sees "No organizations"
    await expect(page.getByText('No organizations')).toBeVisible();

    await page.getByRole('link', { name: 'Admin Users' }).first().click();
    await page.waitForURL((url) => url.pathname === '/admin/users');
    await expect(
      page.getByText('Authorized to manage system roles'),
    ).toBeVisible();

    // System ADMIN without org membership cannot access org-scoped /research
    await page.goto('/research');
    await expect(
      page.getByRole('heading', { name: 'Organization Context Required' }),
    ).toBeVisible();
  });

  test('tampering with localStorage/sessionStorage does not grant /admin/users access', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.orgAdminUser, '/dashboard');

    await page.evaluate(() => {
      window.localStorage.setItem('role', 'ADMIN');
      window.localStorage.setItem(
        'systemPermissions',
        JSON.stringify(['users.read', 'users.manage']),
      );
      window.sessionStorage.setItem('isAdmin', 'true');
    });

    await page.goto('/admin/users');
    await expect(
      page.getByRole('heading', { name: 'Access Denied (403)' }),
    ).toBeVisible();
  });
});
