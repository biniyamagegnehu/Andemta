import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 4.8 (D & E) — Organization Switching, Race Protection & Responsive Nav', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('Biniyam switches between Shewa Fashion (OWNER) and Debre Berhan University (RESEARCHER) and permissions update', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.biniyam, '/organizations');

    const orgSelectorBtn = page.getByRole('button', {
      name: /select active organization/i,
    });
    await expect(orgSelectorBtn).toBeVisible();

    // Select Shewa Fashion (OWNER)
    await orgSelectorBtn.click();
    await page
      .getByRole('option', { name: new RegExp('Shewa Fashion', 'i') })
      .click();

    await expect(
      page.getByText('Can edit selected organization'),
    ).toBeVisible();
    await expect(page.getByText('Can manage members')).toBeVisible();

    // Switch to Debre Berhan University (RESEARCHER)
    await orgSelectorBtn.click();
    await page
      .getByRole('option', {
        name: new RegExp('Debre Berhan University', 'i'),
      })
      .click();

    // OWNER-only indicators must disappear; RESEARCHER lacks organization.update & organization.members.invite
    await expect(
      page.getByText('Can edit selected organization'),
    ).toHaveCount(0);
    await expect(page.getByText('Can manage members')).toHaveCount(0);

    // RESEARCHER still has research.read & research.create
    await page.goto('/research');
    await expect(
      page.getByText('Authorized to create research'),
    ).toBeVisible();
  });

  test('delayed response from Organization A cannot overwrite newer Organization B context', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.biniyam, '/organizations');

    const orgSelectorBtn = page.getByRole('button', {
      name: /select active organization/i,
    });
    await expect(orgSelectorBtn).toBeVisible();

    // Ensure we start on Debre Berhan University
    await orgSelectorBtn.click();
    await page
      .getByRole('option', {
        name: new RegExp('Debre Berhan University', 'i'),
      })
      .click();
    await expect(page.getByText('Can edit selected organization')).toHaveCount(0);

    // Intercept Shewa Fashion auth request and delay it by 1200ms
    await page.route(
      `**/api/v1/authorization/organizations/${fixtures.shewaFashionId}`,
      async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      },
    );

    // Trigger Shewa Fashion selection, then quickly switch back to Debre Berhan University
    await orgSelectorBtn.click();
    await page
      .getByRole('option', { name: new RegExp('Shewa Fashion', 'i') })
      .click();

    await orgSelectorBtn.click();
    await page
      .getByRole('option', {
        name: new RegExp('Debre Berhan University', 'i'),
      })
      .click();

    // Wait longer than the delayed Shewa Fashion response
    await page.waitForTimeout(1500);

    // Delayed Shewa Fashion (OWNER) response MUST NOT overwrite Debre Berhan University (RESEARCHER)
    await expect(
      page.getByText('Can edit selected organization'),
    ).toHaveCount(0);
    await expect(page.getByText('Can manage members')).toHaveCount(0);

    await page.unroute(
      `**/api/v1/authorization/organizations/${fixtures.shewaFashionId}`,
    );
  });

  test('mobile navigation drawer opens, shows permission-filtered links, and avoids horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginViaUi(page, fixtures.biniyam, '/dashboard');

    // Verify no horizontal overflow
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    // Open mobile drawer
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    const dialog = page.getByRole('dialog', { name: /mobile navigation/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Admin Users' }),
    ).toHaveCount(0);

    // Close mobile drawer
    await page.getByRole('button', { name: /close navigation menu/i }).click();
    await expect(dialog).toHaveCount(0);
  });
});
