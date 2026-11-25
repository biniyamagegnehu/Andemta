import {
  AUTHENTICATED_NAV_ITEMS,
  getAuthenticatedPageTitle,
} from './navigation';

describe('Authenticated Navigation Configuration', () => {
  it('defines unique internal routes for all navigation items', () => {
    const hrefs = AUTHENTICATED_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith('/')).toBe(true);
    }
    expect(hrefs).toEqual([
      '/dashboard',
      '/organizations',
      '/research',
      '/surveys',
      '/product-testing',
      '/participants',
      '/reports',
    ]);
  });

  it('resolves exact and nested page titles accurately', () => {
    expect(getAuthenticatedPageTitle('/dashboard')).toBe('Dashboard');
    expect(getAuthenticatedPageTitle('/organizations')).toBe('Organizations');
    expect(getAuthenticatedPageTitle('/organizations/123')).toBe(
      'Organizations',
    );
    expect(getAuthenticatedPageTitle('/product-testing')).toBe(
      'Product Testing',
    );
    expect(getAuthenticatedPageTitle('/unknown-path')).toBe('Dashboard');
    expect(getAuthenticatedPageTitle(null)).toBe('Dashboard');
  });
});
