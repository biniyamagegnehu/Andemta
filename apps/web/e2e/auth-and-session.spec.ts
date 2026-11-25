import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  setupPhase48Fixtures,
  type Phase48Fixtures,
} from './fixtures/test-fixtures';

let fixtures: Phase48Fixtures;

test.describe('Phase 4.8 (A) — Browser Authentication & Session Lifecycle', () => {
  test.beforeAll(async () => {
    fixtures = await setupPhase48Fixtures();
  });

  test.afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
    }
  });

  test('unauthenticated user is redirected from protected routes to /login with returnUrl', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/login', {
      timeout: 15_000,
    });
    expect(page.url()).toContain('returnUrl=%2Fdashboard');

    await page.goto('/admin/users');
    await page.waitForURL((url) => url.pathname === '/login', {
      timeout: 15_000,
    });
    expect(page.url()).toContain('returnUrl=%2Fadmin%2Fusers');
  });

  test('public authentication pages remain accessible when unauthenticated', async ({
    page,
  }) => {
    for (const path of ['/', '/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}`));
    }
  });

  test('authenticated user accesses /dashboard, preserves session on reload, stores no tokens in web storage, and clears state on logout', async ({
    page,
  }) => {
    await loginViaUi(page, fixtures.biniyam, '/dashboard');
    await expect(
      page.getByRole('heading', { name: new RegExp(fixtures.biniyam.email, 'i') }),
    ).toBeVisible();

    // Verify no JWT or refresh token is persisted in localStorage or sessionStorage
    const storageDump = await page.evaluate(() => ({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    }));
    expect(JSON.stringify(storageDump)).not.toContain('eyJ');

    // Reload preserves authenticated session via HttpOnly refresh cookie
    await page.reload();
    await expect(
      page.getByRole('heading', { name: new RegExp(fixtures.biniyam.email, 'i') }),
    ).toBeVisible({ timeout: 15_000 });

    // Logout via UserAccountMenu
    await page.getByRole('button', { name: /user account menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await page.waitForURL((url) => url.pathname === '/login', {
      timeout: 15_000,
    });

    // Protected route is inaccessible after logout
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/login', {
      timeout: 15_000,
    });
  });

  test('login with returnUrl redirects back to the originally requested protected page', async ({
    page,
  }) => {
    await page.goto('/organizations');
    await page.waitForURL((url) => url.pathname === '/login');

    await page.getByLabel('Email address').fill(fixtures.biniyam.email);
    await page.getByLabel('Password', { exact: true }).fill(fixtures.biniyam.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL((url) => url.pathname === '/organizations', {
      timeout: 15_000,
    });
    await expect(
      page.getByRole('heading', { name: /organizations/i }).first(),
    ).toBeVisible();
  });
});
