import { resolveValidOrganizationId } from './organization-context';
import type { UserOrganization } from '@/lib/api';

describe('Organization Context Selection Logic', () => {
  const orgs: UserOrganization[] = [
    {
      id: 'org-a',
      name: 'Org Alpha',
      slug: 'org-alpha',
      type: 'BUSINESS',
      status: 'ACTIVE',
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
      roleCode: 'OWNER',
    },
    {
      id: 'org-b',
      name: 'Addis University Lab',
      slug: 'addis-university-lab',
      type: 'UNIVERSITY',
      status: 'ACTIVE',
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
      roleCode: 'RESEARCHER',
    },
  ];

  it('returns null when organization list is empty', () => {
    expect(resolveValidOrganizationId([], 'org-a')).toBeNull();
    expect(resolveValidOrganizationId([], null)).toBeNull();
  });

  it('preserves a valid selected organization ID present in the list', () => {
    expect(resolveValidOrganizationId(orgs, 'org-b')).toBe('org-b');
  });

  it('replaces an invalid or unauthorized organization ID with the first valid organization', () => {
    expect(resolveValidOrganizationId(orgs, 'foreign-org-id')).toBe('org-a');
    expect(resolveValidOrganizationId(orgs, null)).toBe('org-a');
  });
});
