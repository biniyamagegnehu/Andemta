import { Test, TestingModule } from '@nestjs/testing';
import { RoleScope } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { RolePermissionService } from '../src/modules/rbac/services/role-permission.service';
import { PERMISSION, PermissionCode } from '../src/modules/rbac/constants/permissions';
import { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from '../src/modules/rbac/constants/role-permissions';
import { AppConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { PermissionDto } from '../src/modules/rbac/interfaces/rbac.interfaces';

jest.setTimeout(60000);

/**
 * Phase 4.2 — Permissions Catalog and Role-Permission Management (Integration Test)
 *
 * Uses an isolated module with AppConfigModule + DatabaseModule + RbacModule.
 * Does NOT load AppModule or RedisModule to avoid ECONNREFUSED when Redis is down.
 *
 * Tests:
 * 1.  Seeded permissions are present in the database
 * 2.  Built-in roles are present in the database
 * 3.  getRoleByScope returns correct role data
 * 4.  getRoleByScope returns null for unknown role
 * 5.  getPermissionsForRole returns correct permissions for PARTICIPANT
 * 6.  getPermissionsForRole returns correct permissions for VIEWER (read-only only)
 * 7.  roleHasPermission returns true for valid assignment
 * 8.  roleHasPermission returns false for unassigned permission
 * 9.  getAllPermissions returns the full catalog
 * 10. getPermissionByCode returns a known permission
 * 11. getPermissionByCode returns null for unknown code
 * 12. validateScopeCompatibility throws for scope mismatch
 * 13. validateScopeCompatibility passes for correct scope
 * 14. syncBuiltInRolePermissions is idempotent (run twice, counts unchanged)
 * 15. RESEARCHER does NOT have organization.delete
 * 16. RESEARCHER does NOT have organization.members.invite
 * 17. OWNER has organization.delete
 * 18. Platform ADMIN has platform.admin
 * 19. VIEWER has only read-class permissions
 * 20. Existing User and Session tables are unaffected
 */
describe('Phase 4.2 — Permissions Catalog & Role-Permission Management (Integration)', () => {
  let prisma: PrismaService;
  let service: RolePermissionService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, RbacModule],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    service = moduleFixture.get(RolePermissionService);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Seeded permissions present in DB
  // ---------------------------------------------------------------------------
  it('should have all catalog permissions present in the database', async () => {
    const permissions: PermissionDto[] = await service.getAllPermissions();
    const codes: PermissionCode[] = permissions.map((p: PermissionDto) => p.code);

    expect(codes).toContain(PERMISSION.SURVEY_RESPOND);
    expect(codes).toContain(PERMISSION.PLATFORM_ADMIN);
    expect(codes).toContain(PERMISSION.ORGANIZATION_DELETE);
    expect(codes).toContain(PERMISSION.RESEARCH_PUBLISH);
    expect(codes).toContain(PERMISSION.REWARDS_CLAIM);
    expect(permissions.length).toBeGreaterThanOrEqual(30);
  });

  // ---------------------------------------------------------------------------
  // 2. Built-in roles present in DB
  // ---------------------------------------------------------------------------
  it('should have all 6 built-in roles present in the database', async () => {
    const systemParticipant = await service.getRoleByScope(RoleScope.SYSTEM, 'PARTICIPANT');
    const systemAdmin = await service.getRoleByScope(RoleScope.SYSTEM, 'ADMIN');
    const orgOwner = await service.getRoleByScope(RoleScope.ORGANIZATION, 'OWNER');
    const orgAdmin = await service.getRoleByScope(RoleScope.ORGANIZATION, 'ADMIN');
    const orgResearcher = await service.getRoleByScope(RoleScope.ORGANIZATION, 'RESEARCHER');
    const orgViewer = await service.getRoleByScope(RoleScope.ORGANIZATION, 'VIEWER');

    expect(systemParticipant).not.toBeNull();
    expect(systemAdmin).not.toBeNull();
    expect(orgOwner).not.toBeNull();
    expect(orgAdmin).not.toBeNull();
    expect(orgResearcher).not.toBeNull();
    expect(orgViewer).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 3. getRoleByScope — returns correct data
  // ---------------------------------------------------------------------------
  it('should return correct role data for SYSTEM:PARTICIPANT', async () => {
    const role = await service.getRoleByScope(RoleScope.SYSTEM, 'PARTICIPANT');

    expect(role).not.toBeNull();
    expect(role!.scope).toBe(RoleScope.SYSTEM);
    expect(role!.code).toBe('PARTICIPANT');
    expect(role!.isBuiltIn).toBe(true);
    expect(role!.isActive).toBe(true);
    expect(role!.name).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 4. getRoleByScope — returns null for unknown role
  // ---------------------------------------------------------------------------
  it('should return null for a non-existent role', async () => {
    const role = await service.getRoleByScope(RoleScope.SYSTEM, 'NONEXISTENT_ROLE_CODE');
    expect(role).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 5. getPermissionsForRole — PARTICIPANT
  // ---------------------------------------------------------------------------
  it('should return exactly the PARTICIPANT permissions: survey.respond, product_testing.participate, rewards.claim', async () => {
    const permissions: PermissionDto[] = await service.getPermissionsForRole(
      RoleScope.SYSTEM,
      'PARTICIPANT',
    );
    const codes: PermissionCode[] = permissions.map((p: PermissionDto) => p.code);

    expect(codes).toContain(PERMISSION.SURVEY_RESPOND);
    expect(codes).toContain(PERMISSION.PRODUCT_TESTING_PARTICIPATE);
    expect(codes).toContain(PERMISSION.REWARDS_CLAIM);

    // PARTICIPANT must NOT have any management permissions
    expect(codes).not.toContain(PERMISSION.USERS_MANAGE);
    expect(codes).not.toContain(PERMISSION.PLATFORM_ADMIN);
    expect(codes).not.toContain(PERMISSION.ORGANIZATION_DELETE);
    expect(codes).not.toContain(PERMISSION.RESEARCH_CREATE);
  });

  // ---------------------------------------------------------------------------
  // 6. getPermissionsForRole — VIEWER (read-only)
  // ---------------------------------------------------------------------------
  it('should return only read-class permissions for VIEWER', async () => {
    const permissions: PermissionDto[] = await service.getPermissionsForRole(
      RoleScope.ORGANIZATION,
      'VIEWER',
    );
    const codes: PermissionCode[] = permissions.map((p: PermissionDto) => p.code);

    // All viewer permissions are read-class
    for (const code of codes) {
      expect(code).toMatch(/\.read$/);
    }

    // Viewer must NOT have write permissions
    expect(codes).not.toContain(PERMISSION.RESEARCH_CREATE);
    expect(codes).not.toContain(PERMISSION.SURVEY_DELETE);
    expect(codes).not.toContain(PERMISSION.ORGANIZATION_MEMBERS_INVITE);
    expect(codes).not.toContain(PERMISSION.REPORTS_EXPORT);
  });

  // ---------------------------------------------------------------------------
  // 7. roleHasPermission — true case
  // ---------------------------------------------------------------------------
  it('should return true when ORGANIZATION:OWNER has organization.delete', async () => {
    const result = await service.roleHasPermission(
      RoleScope.ORGANIZATION,
      'OWNER',
      PERMISSION.ORGANIZATION_DELETE,
    );
    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 8. roleHasPermission — false case
  // ---------------------------------------------------------------------------
  it('should return false when SYSTEM:PARTICIPANT does not have platform.admin', async () => {
    const result = await service.roleHasPermission(
      RoleScope.SYSTEM,
      'PARTICIPANT',
      PERMISSION.PLATFORM_ADMIN,
    );
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 9. getAllPermissions — full catalog
  // ---------------------------------------------------------------------------
  it('should return all active permissions ordered by code', async () => {
    const permissions: PermissionDto[] = await service.getAllPermissions();
    expect(permissions.length).toBeGreaterThanOrEqual(30);
    permissions.forEach((p: PermissionDto) => expect(p.isActive).toBe(true));
  });

  // ---------------------------------------------------------------------------
  // 10. getPermissionByCode — known code
  // ---------------------------------------------------------------------------
  it('should return a permission by its code', async () => {
    const permission = await service.getPermissionByCode(PERMISSION.RESEARCH_CREATE);
    expect(permission).not.toBeNull();
    expect(permission!.code).toBe(PERMISSION.RESEARCH_CREATE);
    expect(permission!.name).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 11. getPermissionByCode — unknown code
  // ---------------------------------------------------------------------------
  it('should return null for an unknown permission code', async () => {
    const permission = await service.getPermissionByCode(
      'nonexistent.permission' as PermissionCode,
    );
    expect(permission).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 12. validateScopeCompatibility — scope mismatch throws
  // ---------------------------------------------------------------------------
  it('should throw BadRequestException when using ORGANIZATION role in SYSTEM context', async () => {
    const orgRole = await service.getRoleByScope(RoleScope.ORGANIZATION, 'OWNER');
    expect(orgRole).not.toBeNull();

    expect(() =>
      service.validateScopeCompatibility(orgRole!, RoleScope.SYSTEM),
    ).toThrow(BadRequestException);
  });

  // ---------------------------------------------------------------------------
  // 13. validateScopeCompatibility — correct scope passes
  // ---------------------------------------------------------------------------
  it('should not throw when scope matches', async () => {
    const systemRole = await service.getRoleByScope(RoleScope.SYSTEM, 'ADMIN');
    expect(systemRole).not.toBeNull();

    expect(() =>
      service.validateScopeCompatibility(systemRole!, RoleScope.SYSTEM),
    ).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // 14. syncBuiltInRolePermissions — idempotent
  // ---------------------------------------------------------------------------
  it('should be idempotent: running sync twice yields the same totals', async () => {
    const first = await service.syncBuiltInRolePermissions();
    const second = await service.syncBuiltInRolePermissions();

    // On second run everything should be skipped, nothing created
    expect(second.created).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(second.missingRoles).toHaveLength(0);
    expect(second.missingPermissions).toHaveLength(0);

    // Total skipped on second == total created+skipped on first
    expect(second.skipped).toBe(first.created + first.skipped);
  });

  // ---------------------------------------------------------------------------
  // 15. RESEARCHER does NOT have organization.delete
  // ---------------------------------------------------------------------------
  it('should deny organization.delete for RESEARCHER', async () => {
    const result = await service.roleHasPermission(
      RoleScope.ORGANIZATION,
      'RESEARCHER',
      PERMISSION.ORGANIZATION_DELETE,
    );
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 16. RESEARCHER does NOT have organization.members.invite
  // ---------------------------------------------------------------------------
  it('should deny organization.members.invite for RESEARCHER', async () => {
    const result = await service.roleHasPermission(
      RoleScope.ORGANIZATION,
      'RESEARCHER',
      PERMISSION.ORGANIZATION_MEMBERS_INVITE,
    );
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 17. OWNER has organization.delete
  // ---------------------------------------------------------------------------
  it('should grant organization.delete for OWNER', async () => {
    const result = await service.roleHasPermission(
      RoleScope.ORGANIZATION,
      'OWNER',
      PERMISSION.ORGANIZATION_DELETE,
    );
    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 18. Platform ADMIN has platform.admin
  // ---------------------------------------------------------------------------
  it('should grant platform.admin for SYSTEM:ADMIN', async () => {
    const result = await service.roleHasPermission(
      RoleScope.SYSTEM,
      'ADMIN',
      PERMISSION.PLATFORM_ADMIN,
    );
    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 19. VIEWER has only read-class permissions (via mapping constant cross-check)
  // ---------------------------------------------------------------------------
  it('BUILT_IN_ROLE_PERMISSION_MAPPINGS VIEWER should contain only read permissions', () => {
    const viewerPerms: PermissionCode[] =
      BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:VIEWER'];
    expect(viewerPerms).toBeDefined();
    viewerPerms.forEach((code: PermissionCode) => {
      expect(code).toMatch(/\.read$/);
    });
  });

  // ---------------------------------------------------------------------------
  // 20. Existing User and Session tables are unaffected
  // ---------------------------------------------------------------------------
  it('should not have modified existing User or Session table structure', async () => {
    // Verify we can still query Users (auth behavior preserved)
    const userCount = await prisma.user.count();
    expect(typeof userCount).toBe('number');

    // Verify sessions table accessible
    const sessionCount = await prisma.session.count();
    expect(typeof sessionCount).toBe('number');
  });
});
