import {
  INestApplication,
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
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
import {
  RbacModule,
  PermissionsGuard,
  OrganizationAuthGuard,
  RequirePermissions,
  CurrentOrganization,
  OrganizationContext,
  PERMISSION,
} from '../src/modules/rbac';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { API_PREFIX } from '../src/common/constants';
import { runRbacSeed } from '../prisma/seed';

jest.setTimeout(60000);

/**
 * Test-only controller verifying Phase 4.4 OrganizationAuthGuard,
 * @CurrentOrganization(), and PermissionsGuard integration.
 */
@Controller('organizations')
class OrgAuthTestController {
  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @Get(':organizationId/context')
  getContext(@CurrentOrganization() org: OrganizationContext) {
    return org;
  }

  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @RequirePermissions(PERMISSION.RESEARCH_CREATE)
  @Post(':organizationId/research')
  createResearch(
    @CurrentOrganization() org: OrganizationContext,
    @Body() _body: { organizationId?: string },
  ) {
    return {
      organizationId: org.organizationId,
      roleCode: org.roleCode,
      membershipId: org.membershipId,
    };
  }

  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @RequirePermissions(PERMISSION.RESEARCH_READ)
  @Get(':organizationId/research')
  readResearch(@CurrentOrganization() org: OrganizationContext) {
    return {
      organizationId: org.organizationId,
      roleCode: org.roleCode,
    };
  }

  @RequirePermissions(PERMISSION.RESEARCH_READ)
  @Get('missing-context')
  missingContext() {
    return { ok: false };
  }

  @RequirePermissions(PERMISSION.PLATFORM_ADMIN)
  @Get('system/platform-admin')
  platformAdminOnly() {
    return { platformAdmin: true };
  }
}

describe('Phase 4.4 — Organization & Membership Authorization (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let multiOrgUserId: string; // RESEARCHER in Org A, VIEWER in Org B
  let orgAdminUserId: string; // ADMIN in Org A
  let platformAdminUserId: string; // SYSTEM:ADMIN (no org membership)
  let suspendedMemberUserId: string; // SUSPENDED in Org A
  let invitedMemberUserId: string; // INVITED in Org A
  let inactiveMemberUserId: string; // INACTIVE in Org A
  let outsiderUserId: string; // No org memberships

  let orgAId: string;
  let orgBId: string;
  let suspendedOrgId: string;

  let multiOrgToken: string;
  let orgAdminToken: string;
  let platformAdminToken: string;
  let suspendedMemberToken: string;
  let invitedMemberToken: string;
  let inactiveMemberToken: string;
  let outsiderToken: string;

  const signTokenForUser = (userId: string, email: string): string =>
    jwtService.sign({
      sub: userId,
      email,
      tokenVersion: 0,
    });

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
      controllers: [OrgAuthTestController],
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
          email: `rbac44-${tag}-${suffix}@andemta.test`,
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const [
      uMultiOrg,
      uOrgAdmin,
      uPlatformAdmin,
      uSuspended,
      uInvited,
      uInactive,
      uOutsider,
    ] = await Promise.all([
      createTestUser('multi-org'),
      createTestUser('org-admin'),
      createTestUser('platform-admin'),
      createTestUser('suspended'),
      createTestUser('invited'),
      createTestUser('inactive'),
      createTestUser('outsider'),
    ]);

    multiOrgUserId = uMultiOrg.id;
    orgAdminUserId = uOrgAdmin.id;
    platformAdminUserId = uPlatformAdmin.id;
    suspendedMemberUserId = uSuspended.id;
    invitedMemberUserId = uInvited.id;
    inactiveMemberUserId = uInactive.id;
    outsiderUserId = uOutsider.id;

    const [orgA, orgB, orgSuspended] = await Promise.all([
      prisma.organization.create({
        data: {
          name: `Org A ${suffix}`,
          slug: `org44-a-${suffix}`,
          type: OrganizationType.UNIVERSITY,
          status: OrganizationStatus.ACTIVE,
        },
      }),
      prisma.organization.create({
        data: {
          name: `Org B ${suffix}`,
          slug: `org44-b-${suffix}`,
          type: OrganizationType.BUSINESS,
          status: OrganizationStatus.ACTIVE,
        },
      }),
      prisma.organization.create({
        data: {
          name: `Org Suspended ${suffix}`,
          slug: `org44-susp-${suffix}`,
          type: OrganizationType.OTHER,
          status: OrganizationStatus.SUSPENDED,
        },
      }),
    ]);

    orgAId = orgA.id;
    orgBId = orgB.id;
    suspendedOrgId = orgSuspended.id;
    createdOrgIds.push(orgAId, orgBId, suspendedOrgId);

    const [
      sysAdminRole,
      orgAdminRole,
      orgResearcherRole,
      orgViewerRole,
    ] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'ADMIN' } },
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

    await prisma.userSystemRole.create({
      data: {
        userId: platformAdminUserId,
        roleId: sysAdminRole.id,
        roleScope: RoleScope.SYSTEM,
      },
    });

    await prisma.organizationMembership.createMany({
      data: [
        // multiOrgUser: RESEARCHER in Org A, VIEWER in Org B, RESEARCHER in suspendedOrg
        {
          organizationId: orgAId,
          userId: multiOrgUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: orgBId,
          userId: multiOrgUserId,
          roleId: orgViewerRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: suspendedOrgId,
          userId: multiOrgUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        // orgAdminUser: ADMIN in Org A
        {
          organizationId: orgAId,
          userId: orgAdminUserId,
          roleId: orgAdminRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        // Non-active memberships in Org A
        {
          organizationId: orgAId,
          userId: suspendedMemberUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.SUSPENDED,
        },
        {
          organizationId: orgAId,
          userId: invitedMemberUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.INVITED,
        },
        {
          organizationId: orgAId,
          userId: inactiveMemberUserId,
          roleId: orgResearcherRole.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.INACTIVE,
        },
      ],
    });

    multiOrgToken = signTokenForUser(multiOrgUserId, uMultiOrg.email);
    orgAdminToken = signTokenForUser(orgAdminUserId, uOrgAdmin.email);
    platformAdminToken = signTokenForUser(platformAdminUserId, uPlatformAdmin.email);
    suspendedMemberToken = signTokenForUser(suspendedMemberUserId, uSuspended.email);
    invitedMemberToken = signTokenForUser(invitedMemberUserId, uInvited.email);
    inactiveMemberToken = signTokenForUser(inactiveMemberUserId, uInactive.email);
    outsiderToken = signTokenForUser(outsiderUserId, uOutsider.email);
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

  describe('Organization Context Resolution', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .expect(401);
    });

    it('returns 400 Bad Request for malformed organization ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/not-a-valid-uuid/context')
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(400);
    });

    it('returns 404 Not Found for nonexistent organization', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/99999999-9999-4999-8999-999999999999/context')
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(404);
    });

    it('returns 403 Forbidden for inactive/suspended organization', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${suspendedOrgId}/context`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(403);
    });

    it('returns 403 Forbidden when organization context is missing', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/missing-context')
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(403);
    });

    it('ignores untrusted body organizationId and scopes strictly to route param', async () => {
      // User is VIEWER in Org B (cannot create research) and RESEARCHER in Org A (can create).
      // Sending Org A's ID in the body on Org B's route MUST still fail with 403!
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/research`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .send({ organizationId: orgAId })
        .expect(403);
    });
  });

  describe('Membership Validation & Multi-Org Roles', () => {
    it('attaches typed OrganizationContext via @CurrentOrganization() for active member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        organizationId: orgAId,
        organizationType: OrganizationType.UNIVERSITY,
        userId: multiOrgUserId,
        roleCode: 'RESEARCHER',
      });
      expect(Array.isArray(res.body.data.permissions)).toBe(true);
    });

    it('denies user with no membership (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });

    it('denies suspended, invited, and inactive memberships (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${suspendedMemberToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${invitedMemberToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${inactiveMemberToken}`)
        .expect(403);
    });

    it('resolves different roles across multiple organizations for the same user', async () => {
      const resA = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/context`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(200);
      expect(resA.body.data.roleCode).toBe('RESEARCHER');

      const resB = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/context`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(200);
      expect(resB.body.data.roleCode).toBe('VIEWER');
    });
  });

  describe('Cross-Organization Isolation & Scope Purity', () => {
    it('Researcher in Org A can create research in Org A, but NOT in Org B where they are Viewer', async () => {
      const resA = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/research`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .send({})
        .expect(201);
      expect(resA.body.data.organizationId).toBe(orgAId);
      expect(resA.body.data.roleCode).toBe('RESEARCHER');

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/research`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .send({})
        .expect(403);
    });

    it('Viewer in Org B can read research in Org B', async () => {
      const resB = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/research`)
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(200);
      expect(resB.body.data.roleCode).toBe('VIEWER');
    });

    it('Organization ADMIN cannot access Platform ADMIN routes (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/system/platform-admin')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });

    it('Platform ADMIN without organization membership cannot access organization routes (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/research`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(403);
    });
  });

  describe('Authentication Regression', () => {
    it('GET /api/v1/auth/me remains unaffected', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${multiOrgToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(multiOrgUserId);
    });
  });
});
