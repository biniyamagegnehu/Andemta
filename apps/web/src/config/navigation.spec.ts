import {
  AUTHENTICATED_NAV_ITEMS,
  filterNavigationItems,
  getAuthenticatedPageTitle,
} from './navigation';

describe('Authenticated Navigation Configuration & Permission Filtering', () => {
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
      '/admin/users',
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
    expect(getAuthenticatedPageTitle('/admin/users')).toBe('Admin Users');
    expect(getAuthenticatedPageTitle('/unknown-path')).toBe('Dashboard');
    expect(getAuthenticatedPageTitle(null)).toBe('Dashboard');
  });

  it('fails closed while loading or when error occurs (shows only public-auth nav items)', () => {
    const loadingResult = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: true,
      isOrganizationLoading: true,
      hasError: false,
      systemPermissions: ['users.read'],
      organizationPermissions: ['research.read'],
      hasSelectedOrganization: true,
    });
    expect(loadingResult.map((i) => i.href)).toEqual([
      '/dashboard',
      '/organizations',
    ]);

    const errorResult = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: false,
      isOrganizationLoading: false,
      hasError: true,
      systemPermissions: ['users.read'],
      organizationPermissions: ['research.read'],
      hasSelectedOrganization: true,
    });
    expect(errorResult.map((i) => i.href)).toEqual([
      '/dashboard',
      '/organizations',
    ]);
  });

  it('adapts navigation when Biniyam switches between Shewa Fashion (OWNER) and Debre Berhan University (RESEARCHER)', () => {
    // Shewa Fashion (OWNER): has all org read permissions
    const shewaNav = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: false,
      isOrganizationLoading: false,
      hasError: false,
      systemPermissions: ['survey.respond', 'rewards.claim'],
      organizationPermissions: [
        'organization.read',
        'organization.update',
        'organization.delete',
        'research.read',
        'survey.read',
        'product_testing.read',
        'participants.read',
        'reports.read',
      ],
      hasSelectedOrganization: true,
    });
    expect(shewaNav.map((i) => i.href)).toEqual([
      '/dashboard',
      '/organizations',
      '/research',
      '/surveys',
      '/product-testing',
      '/participants',
      '/reports',
    ]);
    expect(shewaNav.map((i) => i.href)).not.toContain('/admin/users');

    // VIEWER in another org: does NOT have participants.read
    const viewerNav = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: false,
      isOrganizationLoading: false,
      hasError: false,
      systemPermissions: ['survey.respond'],
      organizationPermissions: [
        'organization.read',
        'research.read',
        'survey.read',
        'product_testing.read',
        'reports.read',
      ],
      hasSelectedOrganization: true,
    });
    expect(viewerNav.map((i) => i.href)).not.toContain('/participants');
    expect(viewerNav.map((i) => i.href)).toContain('/research');
  });

  it('shows Admin Users only to Platform ADMIN and denies org items when no org is selected', () => {
    const platformAdminNoOrg = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: false,
      isOrganizationLoading: false,
      hasError: false,
      systemPermissions: ['users.read', 'users.manage', 'platform.admin'],
      organizationPermissions: [],
      hasSelectedOrganization: false,
    });

    expect(platformAdminNoOrg.map((i) => i.href)).toEqual([
      '/dashboard',
      '/organizations',
      '/admin/users',
    ]);
  });

  it('PARTICIPANT without organization membership sees only Dashboard and Organizations', () => {
    const participantNav = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
      isAuthenticated: true,
      isSystemLoading: false,
      isOrganizationLoading: false,
      hasError: false,
      systemPermissions: [
        'survey.respond',
        'product_testing.participate',
        'rewards.claim',
      ],
      organizationPermissions: [],
      hasSelectedOrganization: false,
    });

    expect(participantNav.map((i) => i.href)).toEqual([
      '/dashboard',
      '/organizations',
    ]);
  });
});
