import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  RoleScope,
  OrganizationType,
  OrganizationStatus,
  MembershipStatus,
} from '@prisma/client';
import { AppConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { runRbacSeed } from '../prisma/seed';

jest.setTimeout(60000);

/**
 * Phase 4.1 — RBAC Database Foundation Integration Test Suite
 *
 * Validates the core authorization data structures, relations, constraints, and seed:
 * 1. Role creation, scoping, and uniqueness
 * 2. Permission creation and uniqueness
 * 3. RolePermission mappings and least privilege assignment
 * 4. UserSystemRole multi-role support and uniqueness
 * 5. Organization creation and slug uniqueness
 * 6. OrganizationMembership creation, status, and duplicate prevention
 * 7. Multi-organization membership and distinct roles per org
 * 8. Scope purity enforcement (System vs Organization boundary protection)
 * 9. Seed idempotency and safe backfill
 * 10. Preservation of existing User relationships
 */
describe('Phase 4.1 — RBAC Database Foundation (Integration)', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule],
    }).compile();

    prisma = moduleFixture.get(PrismaService);
    await prisma.$connect();

    // Ensure database is seeded with initial RBAC catalog
    await runRbacSeed(prisma, { backfillUsers: false });
  });

  afterAll(async () => {
    if (prisma) {
      if (createdUserIds.length > 0) {
        await prisma.organizationMembership.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.userSystemRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }

      if (createdOrgIds.length > 0) {
        await prisma.organization.deleteMany({
          where: { id: { in: createdOrgIds } },
        });
      }

      if (createdRoleIds.length > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: createdRoleIds } },
        });
        await prisma.role.deleteMany({
          where: { id: { in: createdRoleIds } },
        });
      }

      if (createdPermissionIds.length > 0) {
        await prisma.permission.deleteMany({
          where: { id: { in: createdPermissionIds } },
        });
      }

      await prisma.$disconnect();
    }
  });

  // Helper to create test user
  async function createTestUser(suffix = `${Date.now()}`): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `rbac-test-${suffix}@andemta.et`,
        passwordHash: 'dummy-hashed-pass',
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  // Helper to create test organization
  async function createTestOrg(
    slug: string,
    type: OrganizationType = OrganizationType.BUSINESS,
  ): Promise<string> {
    const org = await prisma.organization.create({
      data: {
        name: `Org ${slug}`,
        slug,
        type,
        status: OrganizationStatus.ACTIVE,
      },
    });
    createdOrgIds.push(org.id);
    return org.id;
  }

  describe('1. Role Scopes and Uniqueness', () => {
    it('should have all 6 built-in roles in the database with correct scopes', async () => {
      const roles = await prisma.role.findMany();

      const systemRoles = roles.filter((r) => r.scope === RoleScope.SYSTEM);
      const orgRoles = roles.filter((r) => r.scope === RoleScope.ORGANIZATION);

      expect(systemRoles.map((r) => r.code).sort()).toEqual(['ADMIN', 'PARTICIPANT']);
      expect(orgRoles.map((r) => r.code).sort()).toEqual([
        'ADMIN',
        'OWNER',
        'RESEARCHER',
        'VIEWER',
      ]);
    });

    it('should allow ADMIN to exist in both SYSTEM and ORGANIZATION scopes distinctly', async () => {
      const systemAdmin = await prisma.role.findUnique({
        where: {
          scope_code: { scope: RoleScope.SYSTEM, code: 'ADMIN' },
        },
      });

      const orgAdmin = await prisma.role.findUnique({
        where: {
          scope_code: { scope: RoleScope.ORGANIZATION, code: 'ADMIN' },
        },
      });

      expect(systemAdmin).toBeDefined();
      expect(orgAdmin).toBeDefined();
      expect(systemAdmin?.id).not.toEqual(orgAdmin?.id);
      expect(systemAdmin?.scope).toBe(RoleScope.SYSTEM);
      expect(orgAdmin?.scope).toBe(RoleScope.ORGANIZATION);
    });

    it('should reject duplicate role in the same scope', async () => {
      await expect(
        prisma.role.create({
          data: {
            scope: RoleScope.SYSTEM,
            code: 'PARTICIPANT',
            name: 'Duplicate Participant',
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });
  });

  describe('2. Permission Catalog and Uniqueness', () => {
    it('should have all initial permissions created', async () => {
      const permissions = await prisma.permission.findMany();
      expect(permissions.length).toBeGreaterThanOrEqual(36);

      const codes = permissions.map((p) => p.code);
      expect(codes).toContain('survey.respond');
      expect(codes).toContain('organization.delete');
      expect(codes).toContain('research.create');
      expect(codes).toContain('platform.admin');
    });

    it('should reject duplicate permission code', async () => {
      await expect(
        prisma.permission.create({
          data: {
            code: 'survey.respond',
            name: 'Duplicate Survey Respond',
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });
  });

  describe('3. Role-Permission Relationships & Least Privilege', () => {
    it('should grant only participant permissions to SYSTEM:PARTICIPANT', async () => {
      const participantRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
        include: { rolePermissions: { include: { permission: true } } },
      });

      const grantedCodes = participantRole?.rolePermissions.map((rp) => rp.permission.code);
      expect(grantedCodes?.sort()).toEqual([
        'product_testing.participate',
        'rewards.claim',
        'survey.respond',
      ]);
    });

    it('should grant read-only permissions to ORGANIZATION:VIEWER', async () => {
      const viewerRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'VIEWER' } },
        include: { rolePermissions: { include: { permission: true } } },
      });

      const grantedCodes = viewerRole?.rolePermissions.map((rp) => rp.permission.code);
      expect(grantedCodes).toContain('research.read');
      expect(grantedCodes).toContain('survey.read');
      expect(grantedCodes).not.toContain('research.create');
      expect(grantedCodes).not.toContain('survey.create');
      expect(grantedCodes).not.toContain('organization.update');
    });

    it('should grant organization.delete only to ORGANIZATION:OWNER and not to ORGANIZATION:ADMIN', async () => {
      const ownerRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'OWNER' } },
        include: { rolePermissions: { include: { permission: true } } },
      });
      const adminRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'ADMIN' } },
        include: { rolePermissions: { include: { permission: true } } },
      });

      const ownerCodes = ownerRole?.rolePermissions.map((rp) => rp.permission.code);
      const adminCodes = adminRole?.rolePermissions.map((rp) => rp.permission.code);

      expect(ownerCodes).toContain('organization.delete');
      expect(adminCodes).not.toContain('organization.delete');
    });
  });

  describe('4. UserSystemRole & Multiple System Roles', () => {
    it('should allow a user to have multiple system roles (e.g. PARTICIPANT and ADMIN)', async () => {
      const userId = await createTestUser(`multi-system-${Date.now()}`);

      const participantRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      });
      const adminRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'ADMIN' } },
      });

      await prisma.userSystemRole.create({
        data: {
          userId,
          roleId: participantRole!.id,
          roleScope: RoleScope.SYSTEM,
        },
      });

      await prisma.userSystemRole.create({
        data: {
          userId,
          roleId: adminRole!.id,
          roleScope: RoleScope.SYSTEM,
        },
      });

      const userRoles = await prisma.userSystemRole.findMany({
        where: { userId },
        include: { role: true },
      });

      expect(userRoles.length).toBe(2);
      expect(userRoles.map((ur) => ur.role.code).sort()).toEqual(['ADMIN', 'PARTICIPANT']);
    });

    it('should reject duplicate assignment of the same system role to a user', async () => {
      const userId = await createTestUser(`dup-system-${Date.now()}`);
      const participantRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      });

      await prisma.userSystemRole.create({
        data: {
          userId,
          roleId: participantRole!.id,
          roleScope: RoleScope.SYSTEM,
        },
      });

      await expect(
        prisma.userSystemRole.create({
          data: {
            userId,
            roleId: participantRole!.id,
            roleScope: RoleScope.SYSTEM,
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });

    it('should cascade delete userSystemRoles when user is deleted', async () => {
      const user = await prisma.user.create({
        data: {
          email: `cascade-test-${Date.now()}@andemta.et`,
          passwordHash: 'dummy',
        },
      });

      const participantRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      });

      await prisma.userSystemRole.create({
        data: {
          userId: user.id,
          roleId: participantRole!.id,
          roleScope: RoleScope.SYSTEM,
        },
      });

      await prisma.user.delete({ where: { id: user.id } });

      const roles = await prisma.userSystemRole.findMany({
        where: { userId: user.id },
      });
      expect(roles.length).toBe(0);
    });
  });

  describe('5. Organization Creation and Constraints', () => {
    it('should create organization with slug, type, and status', async () => {
      const slug = `addis-ababa-univ-${Date.now()}`;
      const orgId = await createTestOrg(slug, OrganizationType.UNIVERSITY);

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
      });

      expect(org).toBeDefined();
      expect(org?.slug).toBe(slug);
      expect(org?.type).toBe(OrganizationType.UNIVERSITY);
      expect(org?.status).toBe(OrganizationStatus.ACTIVE);
    });

    it('should enforce unique slug across organizations', async () => {
      const slug = `shared-slug-${Date.now()}`;
      await createTestOrg(slug);

      await expect(
        prisma.organization.create({
          data: {
            name: 'Another Org',
            slug,
            type: OrganizationType.BUSINESS,
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });
  });

  describe('6. Organization Memberships and Role Flexibility', () => {
    it('should allow a user to belong to multiple organizations with different roles', async () => {
      const userId = await createTestUser(`multi-org-${Date.now()}`);
      const org1Id = await createTestOrg(`org-uni-${Date.now()}`, OrganizationType.UNIVERSITY);
      const org2Id = await createTestOrg(`org-corp-${Date.now()}`, OrganizationType.BUSINESS);

      const researcherRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' } },
      });
      const viewerRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'VIEWER' } },
      });

      // Role in Org 1: RESEARCHER
      await prisma.organizationMembership.create({
        data: {
          userId,
          organizationId: org1Id,
          roleId: researcherRole!.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
      });

      // Role in Org 2: VIEWER
      await prisma.organizationMembership.create({
        data: {
          userId,
          organizationId: org2Id,
          roleId: viewerRole!.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
      });

      const memberships = await prisma.organizationMembership.findMany({
        where: { userId },
        include: { role: true, organization: true },
      });

      expect(memberships.length).toBe(2);
      const m1 = memberships.find((m) => m.organizationId === org1Id);
      const m2 = memberships.find((m) => m.organizationId === org2Id);

      expect(m1?.role.code).toBe('RESEARCHER');
      expect(m2?.role.code).toBe('VIEWER');
    });

    it('should prevent duplicate membership for the same user in the same organization', async () => {
      const userId = await createTestUser(`dup-mem-${Date.now()}`);
      const orgId = await createTestOrg(`dup-mem-org-${Date.now()}`);

      const ownerRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'OWNER' } },
      });
      const adminRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'ADMIN' } },
      });

      await prisma.organizationMembership.create({
        data: {
          userId,
          organizationId: orgId,
          roleId: ownerRole!.id,
          roleScope: RoleScope.ORGANIZATION,
        },
      });

      // Attempting to add same user to same org (even with different role) must fail
      await expect(
        prisma.organizationMembership.create({
          data: {
            userId,
            organizationId: orgId,
            roleId: adminRole!.id,
            roleScope: RoleScope.ORGANIZATION,
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });
  });

  describe('7. Scope Boundary Protection (Database Constraint Verification)', () => {
    it('should reject assigning an ORGANIZATION role as a SYSTEM role in user_system_roles', async () => {
      const userId = await createTestUser(`scope-violation-1-${Date.now()}`);
      const orgResearcherRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' } },
      });

      // Attempting to insert org role into user_system_roles violates foreign key / scope check
      await expect(
        prisma.userSystemRole.create({
          data: {
            userId,
            roleId: orgResearcherRole!.id,
            roleScope: RoleScope.SYSTEM, // Fails because role's scope is ORGANIZATION
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });

    it('should reject assigning a SYSTEM role as an ORGANIZATION membership role', async () => {
      const userId = await createTestUser(`scope-violation-2-${Date.now()}`);
      const orgId = await createTestOrg(`scope-violation-org-${Date.now()}`);
      const systemParticipantRole = await prisma.role.findUnique({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      });

      // Attempting to insert system role into organization_memberships violates foreign key
      await expect(
        prisma.organizationMembership.create({
          data: {
            userId,
            organizationId: orgId,
            roleId: systemParticipantRole!.id,
            roleScope: RoleScope.ORGANIZATION, // Fails because role's scope is SYSTEM
          },
        }),
      ).rejects.toThrow(PrismaClientKnownRequestError);
    });
  });

  describe('8. Seed Idempotency & Safe Backfill', () => {
    it('should run seed multiple times without creating duplicate roles or permissions', async () => {
      const summary1 = await runRbacSeed(prisma, { backfillUsers: false });
      const summary2 = await runRbacSeed(prisma, { backfillUsers: false });

      expect(summary1.rolesProcessed).toBe(6);
      expect(summary2.rolesProcessed).toBe(6);

      const totalRoles = await prisma.role.count();
      const totalPermissions = await prisma.permission.count();

      expect(totalRoles).toBe(6);
      expect(totalPermissions).toBe(36);
    });

    it('should safely backfill only unassigned users with PARTICIPANT role', async () => {
      const userWithoutRole = await createTestUser(`unassigned-${Date.now()}`);

      const summary = await runRbacSeed(prisma, { backfillUsers: true });
      expect(summary.usersBackfilled).toBeGreaterThanOrEqual(1);

      const systemRole = await prisma.userSystemRole.findFirst({
        where: { userId: userWithoutRole },
        include: { role: true },
      });

      expect(systemRole?.role.code).toBe('PARTICIPANT');
      expect(systemRole?.role.scope).toBe(RoleScope.SYSTEM);

      // Running backfill again should backfill 0 users
      const secondSummary = await runRbacSeed(prisma, { backfillUsers: true });
      expect(secondSummary.usersBackfilled).toBe(0);
    });
  });
});
