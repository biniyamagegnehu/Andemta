import {
  hasAllPermissionsInList,
  hasAnyPermissionInList,
  hasPermissionInList,
} from './authorization-context';

describe('Authorization Context Permission Helpers', () => {
  const granted = ['research.read', 'research.create', 'reports.read'];

  it('evaluates single permission correctly and fails closed on empty/missing', () => {
    expect(hasPermissionInList(granted, 'research.read')).toBe(true);
    expect(hasPermissionInList(granted, 'organization.delete')).toBe(false);
    expect(hasPermissionInList([], 'research.read')).toBe(false);
    expect(hasPermissionInList(granted, '')).toBe(false);
  });

  it('evaluates AnyPermission semantics correctly', () => {
    expect(
      hasAnyPermissionInList(granted, ['organization.delete', 'reports.read']),
    ).toBe(true);
    expect(
      hasAnyPermissionInList(granted, ['organization.delete', 'users.manage']),
    ).toBe(false);
    expect(hasAnyPermissionInList(granted, [])).toBe(false);
  });

  it('evaluates AllPermissions (AND) semantics correctly', () => {
    expect(
      hasAllPermissionsInList(granted, ['research.read', 'research.create']),
    ).toBe(true);
    expect(
      hasAllPermissionsInList(granted, ['research.read', 'reports.export']),
    ).toBe(false);
    expect(hasAllPermissionsInList(granted, [])).toBe(false);
  });
});
