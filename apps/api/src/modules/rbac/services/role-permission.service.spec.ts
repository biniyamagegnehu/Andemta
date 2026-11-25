import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  RoleScope,
  MembershipStatus,
  OrganizationStatus,
} from '@prisma/client';
import { RolePermissionService } from './role-permission.service';
import { PERMISSION, PermissionCode } from '../constants/permissions';
import { BUILT_IN_ROLE_PERMISSION_MAPPINGS } from '../constants/role-permissions';
import { RoleDto } from '../interfaces/rbac.interfaces';

/**
 * Phase 4.2 — RolePermissionService Unit Tests
 *
 * PrismaService is fully mocked. All behaviour is verified in isolation.
 */
describe('RolePermissionService', () => {
  let service: RolePermissionService;

  // ---------------------------------------------------------------------------
  // Mock PrismaService helpers
  // ---------------------------------------------------------------------------
  const mockRole = (overrides: Partial<RoleDto> = {}): RoleDto => ({
    id: 'role-id-1',
    scope: RoleScope.SYSTEM,
    code: 'PARTICIPANT',
    name: 'Platform Participant',
    description: 'General participant.',
    isActive: true,
    isBuiltIn: true,
    ...overrides,
  });

  const mockPermission = (code: PermissionCode = PERMISSION.SURVEY_RESPOND) => ({
    id: `perm-${code}`,
    code,
    name: code,
    description: `Permission for ${code}`,
    isActive: true,
  });

  const makePrismaMock = (overrides: Record<string, unknown> = {}) => ({
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    userSystemRole: {
      findMany: jest.fn(),
    },
    organizationMembership: {
      findUnique: jest.fn(),
    },
    user: { count: jest.fn() },
    session: { count: jest.fn() },
    ...overrides,
  });

  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolePermissionService,
        { provide: 'PrismaService', useValue: prismaMock },
      ],
    })
      .overrideProvider(RolePermissionService)
      .useFactory({
        factory: () => new RolePermissionService(prismaMock as any),
      })
      .compile();

    service = module.get(RolePermissionService);
  });

  // ---------------------------------------------------------------------------
  // getRoleByScope
  // ---------------------------------------------------------------------------
  describe('getRoleByScope', () => {
    it('should return a RoleDto when the role exists', async () => {
      const raw = {
        id: 'r1',
        scope: RoleScope.SYSTEM,
        code: 'PARTICIPANT',
        name: 'Platform Participant',
        description: 'desc',
        isActive: true,
        isBuiltIn: true,
      };
      prismaMock.role.findFirst.mockResolvedValue(raw);

      const result = await service.getRoleByScope(RoleScope.SYSTEM, 'PARTICIPANT');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('PARTICIPANT');
      expect(result!.scope).toBe(RoleScope.SYSTEM);
      expect(prismaMock.role.findFirst).toHaveBeenCalledWith({
        where: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' },
      });
    });

    it('should return null when the role does not exist', async () => {
      prismaMock.role.findFirst.mockResolvedValue(null);
      const result = await service.getRoleByScope(RoleScope.SYSTEM, 'GHOST');
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getRoleByScopeOrThrow
  // ---------------------------------------------------------------------------
  describe('getRoleByScopeOrThrow', () => {
    it('should throw NotFoundException when role is not found', async () => {
      prismaMock.role.findFirst.mockResolvedValue(null);
      await expect(
        service.getRoleByScopeOrThrow(RoleScope.SYSTEM, 'GHOST'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the role when it exists', async () => {
      const raw = {
        id: 'r1', scope: RoleScope.SYSTEM, code: 'ADMIN',
        name: 'Admin', description: 'desc', isActive: true, isBuiltIn: true,
      };
      prismaMock.role.findFirst.mockResolvedValue(raw);
      const result = await service.getRoleByScopeOrThrow(RoleScope.SYSTEM, 'ADMIN');
      expect(result.code).toBe('ADMIN');
    });
  });

  // ---------------------------------------------------------------------------
  // getAllPermissions
  // ---------------------------------------------------------------------------
  describe('getAllPermissions', () => {
    it('should return all active permissions ordered by code', async () => {
      const raw = [
        mockPermission(PERMISSION.SURVEY_RESPOND),
        mockPermission(PERMISSION.PLATFORM_ADMIN),
      ];
      prismaMock.permission.findMany.mockResolvedValue(raw);

      const result = await service.getAllPermissions();
      expect(result).toHaveLength(2);
      expect(result[0].code).toBe(PERMISSION.SURVEY_RESPOND);
      expect(prismaMock.permission.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getPermissionByCode
  // ---------------------------------------------------------------------------
  describe('getPermissionByCode', () => {
    it('should return a permission when it exists', async () => {
      prismaMock.permission.findUnique.mockResolvedValue(
        mockPermission(PERMISSION.RESEARCH_CREATE),
      );
      const result = await service.getPermissionByCode(PERMISSION.RESEARCH_CREATE);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(PERMISSION.RESEARCH_CREATE);
    });

    it('should return null when permission does not exist', async () => {
      prismaMock.permission.findUnique.mockResolvedValue(null);
      const result = await service.getPermissionByCode('no.such.perm' as PermissionCode);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getPermissionsForRole
  // ---------------------------------------------------------------------------
  describe('getPermissionsForRole', () => {
    it('should return mapped permissions for the role', async () => {
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { permission: mockPermission(PERMISSION.SURVEY_RESPOND) },
        { permission: mockPermission(PERMISSION.REWARDS_CLAIM) },
      ]);

      const result = await service.getPermissionsForRole(RoleScope.SYSTEM, 'PARTICIPANT');
      const codes = result.map((p) => p.code);
      expect(codes).toContain(PERMISSION.SURVEY_RESPOND);
      expect(codes).toContain(PERMISSION.REWARDS_CLAIM);
    });

    it('should return empty array for a role with no permissions', async () => {
      prismaMock.rolePermission.findMany.mockResolvedValue([]);
      const result = await service.getPermissionsForRole(RoleScope.SYSTEM, 'GHOST');
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // roleHasPermission
  // ---------------------------------------------------------------------------
  describe('roleHasPermission', () => {
    it('should return true when the assignment exists', async () => {
      prismaMock.rolePermission.count.mockResolvedValue(1);
      const result = await service.roleHasPermission(
        RoleScope.ORGANIZATION, 'OWNER', PERMISSION.ORGANIZATION_DELETE,
      );
      expect(result).toBe(true);
    });

    it('should return false when the assignment does not exist', async () => {
      prismaMock.rolePermission.count.mockResolvedValue(0);
      const result = await service.roleHasPermission(
        RoleScope.SYSTEM, 'PARTICIPANT', PERMISSION.PLATFORM_ADMIN,
      );
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validateScopeCompatibility
  // ---------------------------------------------------------------------------
  describe('validateScopeCompatibility', () => {
    it('should throw BadRequestException when scope does not match', () => {
      const orgRole = mockRole({ scope: RoleScope.ORGANIZATION, code: 'OWNER' });
      expect(() =>
        service.validateScopeCompatibility(orgRole, RoleScope.SYSTEM),
      ).toThrow(BadRequestException);
    });

    it('should not throw when scope matches', () => {
      const sysRole = mockRole({ scope: RoleScope.SYSTEM, code: 'ADMIN' });
      expect(() =>
        service.validateScopeCompatibility(sysRole, RoleScope.SYSTEM),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // syncBuiltInRolePermissions
  // ---------------------------------------------------------------------------
  describe('syncBuiltInRolePermissions', () => {
    it('should create missing assignments and skip existing ones', async () => {
      // Provide only the roles/permissions needed for SYSTEM:PARTICIPANT
      // The other role keys will appear in missingRoles (expected behaviour)
      const participantRoleId = 'role-system-participant';
      const surveyRespondPermId = 'perm-survey-respond';
      const ptParticipatePermId = 'perm-pt-participate';
      const rewardsClaimPermId = 'perm-rewards-claim';

      prismaMock.role.findMany.mockResolvedValue([
        { id: participantRoleId, scope: RoleScope.SYSTEM, code: 'PARTICIPANT' },
      ]);
      prismaMock.permission.findMany.mockResolvedValue([
        { id: surveyRespondPermId, code: PERMISSION.SURVEY_RESPOND },
        { id: ptParticipatePermId, code: PERMISSION.PRODUCT_TESTING_PARTICIPATE },
        { id: rewardsClaimPermId, code: PERMISSION.REWARDS_CLAIM },
      ]);

      // survey.respond already exists; product_testing.participate and rewards.claim do not
      prismaMock.rolePermission.findUnique
        .mockResolvedValueOnce({ roleId: participantRoleId, permissionId: surveyRespondPermId }) // skip
        .mockResolvedValueOnce(null)  // create
        .mockResolvedValueOnce(null); // create

      prismaMock.rolePermission.create.mockResolvedValue({});

      const summary = await service.syncBuiltInRolePermissions();

      // For SYSTEM:PARTICIPANT: 1 skipped, 2 created
      expect(summary.created).toBeGreaterThanOrEqual(2);
      expect(summary.skipped).toBeGreaterThanOrEqual(1);
      expect(summary.rolesProcessed).toBeGreaterThanOrEqual(1);
      // Other role keys missing from mock — expected
      expect(summary.missingRoles.length).toBeGreaterThan(0);
    });

    it('should report missing roles in the summary', async () => {
      prismaMock.role.findMany.mockResolvedValue([]); // No roles in DB
      prismaMock.permission.findMany.mockResolvedValue([]);

      const summary = await service.syncBuiltInRolePermissions();
      expect(summary.missingRoles.length).toBeGreaterThan(0);
    });

    it('should be idempotent — all skipped on second run when all exist', async () => {
      const roles = [
        { id: 'r1', scope: RoleScope.SYSTEM, code: 'PARTICIPANT' },
        { id: 'r2', scope: RoleScope.SYSTEM, code: 'ADMIN' },
        { id: 'r3', scope: RoleScope.ORGANIZATION, code: 'OWNER' },
        { id: 'r4', scope: RoleScope.ORGANIZATION, code: 'ADMIN' },
        { id: 'r5', scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' },
        { id: 'r6', scope: RoleScope.ORGANIZATION, code: 'VIEWER' },
      ];
      const perms = Object.values(PERMISSION).map((code) => ({
        id: `perm-${code}`,
        code,
      }));

      prismaMock.role.findMany.mockResolvedValue(roles);
      prismaMock.permission.findMany.mockResolvedValue(perms);
      // All assignments already exist
      prismaMock.rolePermission.findUnique.mockResolvedValue({ id: 'existing' });

      const summary = await service.syncBuiltInRolePermissions();
      expect(summary.created).toBe(0);
      expect(summary.skipped).toBeGreaterThan(0);
      expect(summary.missingRoles).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Constant-level validation: VIEWER only has .read permissions
  // ---------------------------------------------------------------------------
  describe('BUILT_IN_ROLE_PERMISSION_MAPPINGS constant', () => {
    it('VIEWER mapping should only contain read-class codes', () => {
      const viewerPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:VIEWER'];
      viewerPerms.forEach((code) => {
        expect(code).toMatch(/\.read$/);
      });
    });

    it('PARTICIPANT mapping should not include any management permissions', () => {
      const participantPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['SYSTEM:PARTICIPANT'];
      participantPerms.forEach((code) => {
        expect(code).not.toContain('manage');
        expect(code).not.toContain('admin');
        expect(code).not.toContain('create');
        expect(code).not.toContain('update');
        expect(code).not.toContain('delete');
      });
    });

    it('RESEARCHER mapping should not include organization.delete', () => {
      const researcherPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:RESEARCHER'];
      expect(researcherPerms).not.toContain(PERMISSION.ORGANIZATION_DELETE);
    });

    it('RESEARCHER mapping should not include organization.members.invite', () => {
      const researcherPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:RESEARCHER'];
      expect(researcherPerms).not.toContain(PERMISSION.ORGANIZATION_MEMBERS_INVITE);
    });

    it('OWNER mapping should include organization.delete', () => {
      const ownerPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:OWNER'];
      expect(ownerPerms).toContain(PERMISSION.ORGANIZATION_DELETE);
    });

    it('Platform ADMIN should include platform.admin', () => {
      const adminPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['SYSTEM:ADMIN'];
      expect(adminPerms).toContain(PERMISSION.PLATFORM_ADMIN);
    });

    it('platform ADMIN should NOT include organization.delete', () => {
      const adminPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['SYSTEM:ADMIN'];
      expect(adminPerms).not.toContain(PERMISSION.ORGANIZATION_DELETE);
    });

    it('ORGANIZATION:ADMIN should not include organization.delete (only OWNER can)', () => {
      const orgAdminPerms = BUILT_IN_ROLE_PERMISSION_MAPPINGS['ORGANIZATION:ADMIN'];
      expect(orgAdminPerms).not.toContain(PERMISSION.ORGANIZATION_DELETE);
    });

    it('all 6 built-in role keys should be present in the mapping', () => {
      const keys = Object.keys(BUILT_IN_ROLE_PERMISSION_MAPPINGS);
      expect(keys).toContain('SYSTEM:PARTICIPANT');
      expect(keys).toContain('SYSTEM:ADMIN');
      expect(keys).toContain('ORGANIZATION:OWNER');
      expect(keys).toContain('ORGANIZATION:ADMIN');
      expect(keys).toContain('ORGANIZATION:RESEARCHER');
      expect(keys).toContain('ORGANIZATION:VIEWER');
      expect(keys).toHaveLength(6);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 4.3 — Runtime User Authorization Queries
  // ---------------------------------------------------------------------------
  describe('Phase 4.3 runtime authorization methods', () => {
    it('getUserSystemPermissions should return active permissions from active system roles', async () => {
      prismaMock.userSystemRole.findMany.mockResolvedValue([
        {
          role: {
            rolePermissions: [
              { permission: { code: PERMISSION.SURVEY_RESPOND } },
              { permission: { code: PERMISSION.REWARDS_CLAIM } },
            ],
          },
        },
      ]);

      const perms = await service.getUserSystemPermissions('user-1');

      expect(perms.has(PERMISSION.SURVEY_RESPOND)).toBe(true);
      expect(perms.has(PERMISSION.REWARDS_CLAIM)).toBe(true);
      expect(prismaMock.userSystemRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            roleScope: RoleScope.SYSTEM,
            role: { isActive: true, scope: RoleScope.SYSTEM },
          }),
        }),
      );
    });

    it('getUserOrganizationPermissions should return empty set for suspended membership', async () => {
      prismaMock.organizationMembership.findUnique.mockResolvedValue({
        status: MembershipStatus.SUSPENDED,
        roleScope: RoleScope.ORGANIZATION,
        organization: { status: OrganizationStatus.ACTIVE },
        role: {
          isActive: true,
          scope: RoleScope.ORGANIZATION,
          rolePermissions: [{ permission: { code: PERMISSION.RESEARCH_READ } }],
        },
      });

      const perms = await service.getUserOrganizationPermissions(
        'user-1',
        'org-1',
      );
      expect(perms.size).toBe(0);
    });

    it('getUserOrganizationPermissions should return empty set for inactive role', async () => {
      prismaMock.organizationMembership.findUnique.mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        roleScope: RoleScope.ORGANIZATION,
        organization: { status: OrganizationStatus.ACTIVE },
        role: {
          isActive: false,
          scope: RoleScope.ORGANIZATION,
          rolePermissions: [{ permission: { code: PERMISSION.RESEARCH_READ } }],
        },
      });

      const perms = await service.getUserOrganizationPermissions(
        'user-1',
        'org-1',
      );
      expect(perms.size).toBe(0);
    });

    it('getUserOrganizationPermissions should return empty set for suspended organization', async () => {
      prismaMock.organizationMembership.findUnique.mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        roleScope: RoleScope.ORGANIZATION,
        organization: { status: OrganizationStatus.SUSPENDED },
        role: {
          isActive: true,
          scope: RoleScope.ORGANIZATION,
          rolePermissions: [{ permission: { code: PERMISSION.RESEARCH_READ } }],
        },
      });

      const perms = await service.getUserOrganizationPermissions(
        'user-1',
        'org-1',
      );
      expect(perms.size).toBe(0);
    });

    it('userHasPermissions should deny organization permissions when organizationId is missing', async () => {
      const result = await service.userHasPermissions('user-1', [
        PERMISSION.RESEARCH_READ,
      ]);

      expect(result).toBe(false);
      expect(prismaMock.userSystemRole.findMany).not.toHaveBeenCalled();
      expect(
        prismaMock.organizationMembership.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('userHasPermissions should enforce AND semantics across multiple permissions', async () => {
      prismaMock.organizationMembership.findUnique.mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        roleScope: RoleScope.ORGANIZATION,
        organization: { status: OrganizationStatus.ACTIVE },
        role: {
          isActive: true,
          scope: RoleScope.ORGANIZATION,
          rolePermissions: [{ permission: { code: PERMISSION.RESEARCH_READ } }],
        },
      });

      const result = await service.userHasPermissions(
        'user-1',
        [PERMISSION.RESEARCH_READ, PERMISSION.REPORTS_EXPORT],
        'org-1',
      );

      expect(result).toBe(false);
    });
  });
});
