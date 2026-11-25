import { INestApplication, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  RoleScope,
  OrganizationType,
  OrganizationStatus,
  MembershipStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RbacModule } from '../src/modules/rbac/rbac.module';
import { PermissionsGuard } from '../src/modules/rbac/guards/permissions.guard';
import { RequirePermissions } from '../src/modules/rbac/decorators/require-permissions.decorator';
import { PERMISSION } from '../src/modules/rbac/constants/permissions';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { API_PREFIX } from '../src/common/constants';
import { runRbacSeed } from '../prisma/seed';

jest.setTimeout(60000);

/**
 * Test-only controller verifying runtime authorization guard & decorator behavior
 * without introducing any production organization endpoints (deferred to Phase 4.4).
 */
@Controller('rbac-test')
class RbacTestController {
  @Get('public')
  getPublic() {
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth-only')
  getAuthOnly() {
    return { authenticated: true };
  }

  @RequirePermissions(PERMISSION.PLATFORM_ADMIN)
  @Get('system/admin')
  getPlatformAdmin() {
    return { admin: true };
  }

  @RequirePermissions(PERMISSION.SURVEY_RESPOND)
  @Get('system/participant')
  getParticipantOnly() {
    return { participant: true };
  }

  @RequirePermissions(PERMISSION.RESEARCH_READ, PERMISSION.REPORTS_READ)
  @Get('system/and-check-org')
  getOrgWithoutContext() {
    return { allowed: true };
  }

  @RequirePermissions(PERMISSION.RESEARCH_CREATE, PERMISSION.REPORTS_EXPORT)
  @Get('orgs/:organizationId/research-and-export')
  getOrgResearchAndExport(@Param('organizationId') organizationId: string) {
    return { organizationId };
  }

  @RequirePermissions(PERMISSION.ORGANIZATION_DELETE)
  @Get('orgs/:organizationId/delete-check')
  getOrgDelete(@Param('organizationId') organizationId: string) {
    return { organizationId };
  }

  @RequirePermissions(PERMISSION.RESEARCH_READ)
  @Get('orgs/:organizationId/research-read')
  getOrgResearchRead(@Param('organizationId') organizationId: string) {
    return { organizationId };
  }
}

@RequirePermissions(PERMISSION.ORGANIZATION_READ)
@Controller('rbac-test-precedence')
class RbacPrecedenceTestController {
  @Get('orgs/:organizationId/inherited')
  getInherited(@Param('organizationId') organizationId: string) {
    return { inherited: organizationId };
  }

  @RequirePermissions(PERMISSION.ORGANIZATION_DELETE)
  @Get('orgs/:organizationId/overridden')
  getOverridden(@Param('organizationId') organizationId: string) {
    return { overridden: organizationId };
  }
}

describe('Phase 4.3 — Authorization Guards & Decorators (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let participantUserId: string;
  let platformAdminUserId: string;
  let orgOwnerUserId: string;
  let orgAdminUserId: string;
  let orgResearcherUserId: string;
  let orgViewerUserId: string;
  let suspendedMemberUserId: string;

  let orgAId: string;
  let orgBId: string;
  let inactiveOrgId: string;

  let participantToken: string;
  let platformAdminToken: string;
  let orgOwnerToken: string;
  let orgAdminToken: string;
  let orgResearcherToken: string;
  let orgViewerToken: string;
  let suspendedMemberToken: string;

  const signTokenForUser = (userId: string, email: string): string => {
    return jwtService.sign({
      sub: userId,
      email,
      tokenVersion: 0,
    });
  };

  beforeAll(async () => {
    const mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      checkHealth: jest.fn().mockResolvedValue(true),
      getClient: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, RedisModule, AuthModule, RbacModule],
      controllers: [RbacTestController, RbacPrecedenceTestController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: PermissionsGuard,
        },
      ],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TransformInterceptor(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);

    await runRbacSeed(prisma, { backfillUsers: false });

    const suffix = Date.now();
    const createTestUser = async (tag: string) => {
      const user = await prisma.user.create({
        data: {
          email: `rbac43-${tag}-${suffix}@andemta.test`,
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const [
      uParticipant,
      uPlatformAdmin,
      uOrgOwner,
      uOrgAdmin,
      uOrgResearcher,
      uOrgViewer,
      uSuspended,
    ] = await Promise.all([
      createTestUser('participant'),
      createTestUser('platform-admin'),
      createTestUser('org-owner'),
      createTestUser('org-admin'),
      createTestUser('org-researcher'),
      createTestUser('org-viewer'),
      createTestUser('suspended'),
    ]);

    participantUserId = uParticipant.id;
    platformAdminUserId = uPlatformAdmin.id;
    orgOwnerUserId = uOrgOwner.id;
    orgAdminUserId = uOrgAdmin.id;
    orgResearcherUserId = uOrgResearcher.id;
    orgViewerUserId = uOrgViewer.id;
    suspendedMemberUserId = uSuspended.id;

    // Create organizations
    const orgA = await prisma.organization.create({
      data: {
        name: `Org A ${suffix}`,
        slug: `org-a-${suffix}`,
        type: OrganizationType.BUSINESS,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `Org B ${suffix}`,
        slug: `org-b-${suffix}`,
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const inactiveOrg = await prisma.organization.create({
      data: {
        name: `Org Inactive ${suffix}`,
        slug: `org-inactive-${suffix}`,
        type: OrganizationType.OTHER,
        status: OrganizationStatus.SUSPENDED,
      },
    });

    orgAId = orgA.id;
    orgBId = orgB.id;
    inactiveOrgId = inactiveOrg.id;
    createdOrgIds.push(orgAId, orgBId, inactiveOrgId);

    // Fetch built-in roles
    const [
      sysParticipantRole,
      sysAdminRole,
      orgOwnerRole,
      orgAdminRole,
      orgResearcherRole,
      orgViewerRole,
    ] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'ADMIN' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'OWNER' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'ADMIN' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'VIEWER' } },
      }),
    ]);

    // Assign system roles
    await prisma.userSystemRole.createMany({
      data: [
        { userId: participantUserId, roleId: sysParticipantRole.id, roleScope: RoleScope.SYSTEM },
        { userId: platformAdminUserId, roleId: sysAdminRole.id, roleScope: RoleScope.SYSTEM },
      ],
    });

    // Assign organization memberships in Org A (and Owner in inactiveOrg)
    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: orgAId,
          userId: orgOwnerUserId,
          roleId: orgOwnerRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: orgAId,
          userId: orgAdminUserId,
          roleId: orgAdminRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: orgAId,
          userId: orgResearcherUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: orgAId,
          userId: orgViewerUserId,
          roleId: orgViewerRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: orgAId,
          userId: suspendedMemberUserId,
          roleId: orgOwnerRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.SUSPENDED,
        },
        {
          organizationId: inactiveOrgId,
          userId: orgOwnerUserId,
          roleId: orgOwnerRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });

    participantToken = signTokenForUser(participantUserId, uParticipant.email);
    platformAdminToken = signTokenForUser(platformAdminUserId, uPlatformAdmin.email);
    orgOwnerToken = signTokenForUser(orgOwnerUserId, uOrgOwner.email);
    orgAdminToken = signTokenForUser(orgAdminUserId, uOrgAdmin.email);
    orgResearcherToken = signTokenForUser(orgResearcherUserId, uOrgResearcher.email);
    orgViewerToken = signTokenForUser(orgViewerUserId, uOrgViewer.email);
    suspendedMemberToken = signTokenForUser(suspendedMemberUserId, uSuspended.email);
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
    }
    if (app) {
      await app.close();
    }
  });

  describe('Backward compatibility & Auth execution order', () => {
    it('allows public routes without permission metadata', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/public')
        .expect(200);
    });

    it('rejects unauthenticated requests on @UseGuards(JwtAuthGuard) routes with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/auth-only')
        .expect(401);
    });

    it('allows authenticated requests on @UseGuards(JwtAuthGuard) routes without permission metadata', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/auth-only')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);
    });

    it('returns 401 when unauthenticated on @RequirePermissions route (even without explicit @UseGuards(JwtAuthGuard))', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/admin')
        .expect(401);
    });

    it('returns 401 for malformed JWT on @RequirePermissions route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/admin')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });

  describe('System vs Organization Scope Isolation', () => {
    it('allows Platform ADMIN on system admin route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/admin')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);
    });

    it('denies Organization ADMIN on platform ADMIN route (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/admin')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });

    it('allows PARTICIPANT on survey.respond system route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/participant')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);
    });

    it('denies PARTICIPANT on organization-scoped routes (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/research-read`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(403);
    });

    it('denies Platform ADMIN on organization OWNER route without org membership (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/delete-check`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(403);
    });

    it('denies organization-scoped permission when organization context is missing (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/system/and-check-org')
        .set('Authorization', `Bearer ${orgOwnerToken}`)
        .expect(403);
    });

    it('denies user with membership in Org A from accessing Org B (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgBId}/research-read`)
        .set('Authorization', `Bearer ${orgOwnerToken}`)
        .expect(403);
    });
  });

  describe('AND semantics, Role hierarchy, Status checks & Precedence', () => {
    it('allows RESEARCHER when both RESEARCH_CREATE and REPORTS_EXPORT are granted', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/research-and-export`)
        .set('Authorization', `Bearer ${orgResearcherToken}`)
        .expect(200);
    });

    it('denies VIEWER when RESEARCH_CREATE is missing even if REPORTS_READ exists (AND semantics)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/research-and-export`)
        .set('Authorization', `Bearer ${orgViewerToken}`)
        .expect(403);
    });

    it('allows OWNER on organization.delete, but denies Organization ADMIN (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/delete-check`)
        .set('Authorization', `Bearer ${orgOwnerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/delete-check`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });

    it('denies suspended membership even if assigned OWNER role (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/delete-check`)
        .set('Authorization', `Bearer ${suspendedMemberToken}`)
        .expect(403);
    });

    it('denies access when target organization is SUSPENDED (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${inactiveOrgId}/delete-check`)
        .set('Authorization', `Bearer ${orgOwnerToken}`)
        .expect(403);
    });

    it('enforces controller-level inheritance and handler-level override', async () => {
      // VIEWER has ORGANIZATION_READ (inherited) -> 200
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test-precedence/orgs/${orgAId}/inherited`)
        .set('Authorization', `Bearer ${orgViewerToken}`)
        .expect(200);

      // VIEWER lacks ORGANIZATION_DELETE (handler override) -> 403
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test-precedence/orgs/${orgAId}/overridden`)
        .set('Authorization', `Bearer ${orgViewerToken}`)
        .expect(403);

      // OWNER has ORGANIZATION_DELETE (handler override) -> 200
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test-precedence/orgs/${orgAId}/overridden`)
        .set('Authorization', `Bearer ${orgOwnerToken}`)
        .expect(200);
    });
  });

  describe('Auth endpoints regression check', () => {
    it('GET /api/v1/auth/me remains accessible with valid JWT and returns 401 without JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(participantUserId);
    });
  });
});
