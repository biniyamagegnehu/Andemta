export type NavIconKey =
  | 'dashboard'
  | 'organizations'
  | 'research'
  | 'surveys'
  | 'product-testing'
  | 'participants'
  | 'reports';

export interface NavigationItem {
  label: string;
  href: string;
  icon: NavIconKey;
  description: string;
  isPlaceholder?: boolean;
}

/**
 * Centralized navigation configuration for the authenticated application shell.
 * Shared across desktop sidebar, mobile drawer, and page title resolution.
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
  },
  {
    label: 'Surveys',
    href: '/surveys',
    icon: 'surveys',
    description: 'Survey authoring and responses (upcoming)',
    isPlaceholder: true,
  },
  {
    label: 'Product Testing',
    href: '/product-testing',
    icon: 'product-testing',
    description: 'Product testing campaigns (upcoming)',
    isPlaceholder: true,
  },
  {
    label: 'Participants',
    href: '/participants',
    icon: 'participants',
    description: 'Participant pool management (upcoming)',
    isPlaceholder: true,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'reports',
    description: 'Research analytics and exports (upcoming)',
    isPlaceholder: true,
  },
];

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
