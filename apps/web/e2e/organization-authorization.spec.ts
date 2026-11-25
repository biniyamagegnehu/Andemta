import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 4.8 (C) — Organization-Level Authorization', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('VIEWER in Shewa Fashion can view /research without create action, and gets 403 on /participants', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.viewerUser, '/dashboard');

    // Wait for organizations to load and select Shewa Fashion
    await expect(
      page.getByRole('button', { name: /select active organization/i }),
    ).toBeVisible();

    await page.goto('/research');
    await expect(
      page.getByText('Research module coming soon'),
    ).toBeVisible();
    await expect(
      page.getByText('Authorized to create research'),
    ).toHaveCount(0);

    // VIEWER lacks participants.read -> 403 Access Denied
    await page.goto('/participants');
    await expect(
      page.getByRole('heading', { name: 'Access Denied (403)' }),
    ).toBeVisible();
  });

  test('suspended member does not receive Shewa Fashion and fails closed on /research', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.suspendedMemberUser, '/dashboard');

    await expect(page.getByText('No organizations')).toBeVisible();

    await page.goto('/research');
    await expect(
      page.getByRole('heading', { name: 'Organization Context Required' }),
    ).toBeVisible();
  });
});
