import {
  hasAllPermissionsInList,
  hasAnyPermissionInList,
} from '@/context/authorization-context';

export type NavIconKey =
  | 'dashboard'
  | 'organizations'
  | 'research'
  | 'surveys'
  | 'product-testing'
  | 'participants'
  | 'reports'
  | 'admin-users';

export interface NavigationItem {
  label: string;
  href: string;
  icon: NavIconKey;
  description: string;
  isPlaceholder?: boolean;
  /** SYSTEM-scoped permissions required to view this item */
  requiredSystemPermissions?: string[];
  /** ORGANIZATION-scoped permissions required to view this item */
  requiredOrganizationPermissions?: string[];
  /** Semantics when multiple permissions are specified (default: 'all') */
  permissionMode?: 'all' | 'any';
}

export interface NavigationPermissionContext {
  isAuthenticated: boolean;
  isSystemLoading: boolean;
  isOrganizationLoading: boolean;
  hasError: boolean;
  systemPermissions: readonly string[];
  organizationPermissions: readonly string[];
  hasSelectedOrganization: boolean;
}

/**
 * Centralized navigation configuration for the authenticated application shell.
 * Permission codes match the backend Phase 4.2 permission catalog.
 */
export const AUTHENTICATED_NAV_ITEMS: NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: 'dashboard',
    description: 'Overview of your account and active organizations',
  },
  {
    label: 'Organizations',
    href: '/organizations',
    icon: 'organizations',
    description: 'Organizations you belong to',
  },
  {
    label: 'Research',
    href: '/research',
    icon: 'research',
    description: 'Consumer research studies (upcoming)',
    isPlaceholder: true,
    requiredOrganizationPermissions: ['research.read'],
  },
  {
    label: 'Surveys',
    href: '/surveys',
    icon: 'surveys',
    description: 'Survey authoring and management (upcoming)',
    isPlaceholder: true,
    requiredOrganizationPermissions: ['survey.read'],
  },
  {
    label: 'Product Testing',
    href: '/product-testing',
    icon: 'product-testing',
    description: 'Product testing campaigns (upcoming)',
    isPlaceholder: true,
    requiredOrganizationPermissions: ['product_testing.read'],
  },
  {
    label: 'Participants',
    href: '/participants',
    icon: 'participants',
    description: 'Participant pool management (upcoming)',
    isPlaceholder: true,
    requiredOrganizationPermissions: ['participants.read'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'reports',
    description: 'Research analytics and exports (upcoming)',
    isPlaceholder: true,
    requiredOrganizationPermissions: ['reports.read'],
  },
  {
    label: 'Admin Users',
    href: '/admin/users',
    icon: 'admin-users',
    description: 'Platform user administration',
    isPlaceholder: true,
    requiredSystemPermissions: ['users.read'],
  },
];

/**
 * Filters navigation items based on effective SYSTEM and ORGANIZATION permissions.
 * Fails closed while loading or on authorization error, and never mixes scopes.
 */
export function filterNavigationItems(
  items: readonly NavigationItem[],
  ctx: NavigationPermissionContext,
): NavigationItem[] {
  return items.filter((item) => {
    const mode = item.permissionMode ?? 'all';
    const hasSysReq =
      Array.isArray(item.requiredSystemPermissions) &&
      item.requiredSystemPermissions.length > 0;
    const hasOrgReq =
      Array.isArray(item.requiredOrganizationPermissions) &&
      item.requiredOrganizationPermissions.length > 0;

    if (!hasSysReq && !hasOrgReq) {
      return true;
    }

    if (!ctx.isAuthenticated || ctx.hasError) {
      return false;
    }

    if (hasSysReq) {
      if (ctx.isSystemLoading) return false;
      const sysCheck =
        mode === 'any'
          ? hasAnyPermissionInList(
              ctx.systemPermissions,
              item.requiredSystemPermissions!,
            )
          : hasAllPermissionsInList(
              ctx.systemPermissions,
              item.requiredSystemPermissions!,
            );
      if (!sysCheck) return false;
    }

    if (hasOrgReq) {
      if (!ctx.hasSelectedOrganization || ctx.isOrganizationLoading) {
        return false;
      }
      const orgCheck =
        mode === 'any'
          ? hasAnyPermissionInList(
              ctx.organizationPermissions,
              item.requiredOrganizationPermissions!,
            )
          : hasAllPermissionsInList(
              ctx.organizationPermissions,
              item.requiredOrganizationPermissions!,
            );
      if (!orgCheck) return false;
    }

    return true;
  });
}

/**
 * Resolves a human-readable page title from the current pathname.
 */
export function getAuthenticatedPageTitle(pathname: string | null): string {
  if (!pathname) return 'Dashboard';
  const match = AUTHENTICATED_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match ? match.label : 'Dashboard';
}
