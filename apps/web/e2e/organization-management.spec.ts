import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

test.describe('Phase 5.2 Organization Registration and Management E2E', () => {
  let fixtures: Phase48Fixtures;
  const extraCreatedOrgIds: string[] = [];

  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (extraCreatedOrgIds.length > 0) {
      const prisma = new PrismaClient();
      await prisma.$connect();
      await prisma.organizationMembership.deleteMany({
        where: { organizationId: { in: extraCreatedOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: extraCreatedOrgIds } },
      });
      await prisma.$disconnect();
    }
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('owner can register a new organization, view details, and see it in listing', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newOrgName = `Abay Consumer Research ${suffix}`;
    const newOrgSlug = `abay-research-${suffix}`;

    await loginViaUi(page, fixtures.biniyam, '/organizations');

    await page.getByRole('link', { name: 'Register Organization' }).first().click();
    await page.waitForURL('**/organizations/new');

    await page.getByLabel(/Organization Name/i).fill(newOrgName);
    await page.getByLabel(/Organization Slug/i).fill(newOrgSlug);
    await page.getByLabel(/Organization Type/i).selectOption('UNIVERSITY');

    await page.getByRole('button', { name: 'Register Organization' }).click();

    await page.waitForURL((url) =>
      /^\/organizations\/[0-9a-f-]+$/i.test(url.pathname),
    );

    const createdId = page.url().split('/').pop()!;
    extraCreatedOrgIds.push(createdId);

    await expect(page.getByRole('heading', { name: newOrgName })).toBeVisible();
    await expect(
      page.getByRole('definition').filter({ hasText: 'University' }),
    ).toBeVisible();
    await expect(page.getByText('Role: OWNER')).toBeVisible();

    await page.getByRole('link', { name: 'All Organizations' }).click();
    await page.waitForURL('**/organizations');

    await expect(page.getByRole('heading', { name: newOrgName })).toBeVisible();
  });

  test('shows validation error on empty organization name', async ({ page }) => {
    await loginViaUi(page, fixtures.biniyam, '/organizations/new');

    await page.getByRole('button', { name: 'Register Organization' }).click();

    await expect(
      page.getByText('Organization name is required.'),
    ).toBeVisible();
  });

  test('owner can update organization details and changes persist across reload', async ({
    page,
  }) => {
    const updatedName = `Shewa Fashion Updated ${Date.now()}`;

    await loginViaUi(
      page,
      fixtures.biniyam,
      `/organizations/${fixtures.shewaFashionId}`,
    );

    await expect(
      page.getByRole('heading', { name: 'Update Organization' }),
    ).toBeVisible();

    const nameInput = page.locator('#edit-org-name');
    await nameInput.fill(updatedName);
    await page.locator('#edit-org-type').selectOption('OTHER');

    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(
      page.getByText('Organization details have been updated.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();
    await expect(
      page.getByRole('definition').filter({ hasText: 'Other' }),
    ).toBeVisible();
  });

  test('viewer cannot see organization update form on details page', async ({
    page,
  }) => {
    await loginViaUi(
      page,
      fixtures.viewerUser,
      `/organizations/${fixtures.shewaFashionId}`,
    );

    await expect(
      page.getByRole('heading', { name: 'Organization Overview' }),
    ).toBeVisible();
    await expect(page.getByText('Read-only access')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Update Organization' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save Changes' }),
    ).toHaveCount(0);
  });

  test('user without membership gets access denied on unrelated organization', async ({
    page,
  }) => {
    await loginViaUi(
      page,
      fixtures.biniyam,
      `/organizations/${fixtures.unrelatedOrgId}`,
    );

    await expect(
      page.getByRole('heading', { name: 'Organization access denied' }),
    ).toBeVisible();
  });
});
