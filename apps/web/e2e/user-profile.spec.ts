import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 5.1 — User Profile Management (Browser E2E)', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('unauthenticated user is redirected from /profile to /login with returnUrl', async ({
    page,
  }) => {
    await page.goto('/profile');
    await page.waitForURL((url) => url.pathname === '/login', {
      timeout: 15_000,
    });
    expect(page.url()).toContain('returnUrl=%2Fprofile');
  });

  test('authenticated user opens /profile, sees read-only email and no avatar upload, updates profile, and persists across reload', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.biniyam, '/dashboard');

    // Navigate via UserAccountMenu
    await page.getByRole('button', { name: /user account menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await page.waitForURL((url) => url.pathname === '/profile', {
      timeout: 15_000,
    });

    // Email is read-only and disabled; no file/avatar upload input exists
    const emailInput = page.getByLabel('Email address');
    await expect(emailInput).toBeDisabled();
    await expect(emailInput).toHaveValue(fixtures.biniyam.email);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // Save button is initially disabled when no changes have been made
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await expect(saveButton).toBeDisabled();

    // Cancel restores original values
    await page.getByLabel('Full name').fill('Temporary Name');
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(saveButton).toBeDisabled();

    // Fill valid profile fields and save
    await page.getByLabel('Full name').fill('Biniyam Tesfaye');
    await page.getByLabel('Phone number').fill('+251911223344');
    await page.getByLabel('Preferred language').selectOption('am');
    await page.getByLabel('Bio').fill('Consumer research lead in Addis Ababa.');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(
      page.getByText('Your profile has been updated.'),
    ).toBeVisible();

    // Overview card reflects updated fullName
    await expect(
      page.getByRole('heading', { name: 'Biniyam Tesfaye' }),
    ).toBeVisible();

    // Reload page and confirm persistence from PostgreSQL
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Biniyam Tesfaye' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Phone number')).toHaveValue('+251911223344');
    await expect(page.getByLabel('Preferred language')).toHaveValue('am');
  });
});
