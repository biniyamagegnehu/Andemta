import fs from 'fs';
import path from 'path';
import { AUTHENTICATED_NAV_ITEMS } from '@/config/navigation';
import { getUserInitials } from './user-account-menu';

describe('Authenticated Layout Helpers & Route Integrity', () => {
  it('derives safe uppercase initials from user email', () => {
    expect(getUserInitials('researcher@andemta.et')).toBe('RE');
    expect(getUserInitials('a@andemta.et')).toBe('A');
    expect(getUserInitials(null)).toBe('U');
    expect(getUserInitials(undefined)).toBe('U');
  });

  it('every navigation link in AUTHENTICATED_NAV_ITEMS maps to a real App Router page', () => {
    const appGroupDir = path.resolve(
      __dirname,
      '../../app/(authenticated)',
    );

    for (const item of AUTHENTICATED_NAV_ITEMS) {
      const segment = item.href.replace(/^\//, '');
      const pagePath = path.join(appGroupDir, segment, 'page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });
});
