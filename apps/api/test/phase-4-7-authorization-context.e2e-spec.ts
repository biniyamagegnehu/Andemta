import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  RoleScope,
} from '@prisma/client';
import request from 'supertest';
import { AppConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RbacModule, PermissionsGuard, PERMISSION } from '../src/modules/rbac';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { API_PREFIX } from '../src/common/constants';
import { runRbacSeed } from '../prisma/seed';

jest.setTimeout(60000);

describe('Phase 4.7 — Frontend Authorization Context Endpoints (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let biniyamId: string;
  let platformAdminId: string;
  let suspendedUserId: string;

  let shewaFashionId: string;
  let debreBerhanId: string;

  let biniyamToken: string;
  let platformAdminToken: string;
  let suspendedToken: string;

  const signToken = (userId: string, email: string) =>
    jwtService.sign({ sub: userId, email, tokenVersion: 0 });

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
      providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
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
    const createUser = async (tag: string) => {
      const user = await prisma.user.create({
        data: {
          email: `rbac47-${tag}-${suffix}@andemta.test`,
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const [uBiniyam, uAdmin, uSuspended] = await Promise.all([
      createUser('biniyam'),
      createUser('padmin'),
      createUser('suspended'),
    ]);

    biniyamId = uBiniyam.id;
    platformAdminId = uAdmin.id;
    suspendedUserId = uSuspended.id;

    const [shewa, dbu] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Shewa Fashion',
          slug: `shewa-fashion-${suffix}`,
          type: OrganizationType.BUSINESS,
          status: OrganizationStatus.ACTIVE,
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Debre Berhan University',
          slug: `dbu-${suffix}`,
          type: OrganizationType.UNIVERSITY,
          status: OrganizationStatus.ACTIVE,
        },
      }),
    ]);

    shewaFashionId = shewa.id;
    debreBerhanId = dbu.id;
    createdOrgIds.push(shewaFashionId, debreBerhanId);

    const [sysParticipant, sysAdmin, orgOwner, orgResearcher] =
      await Promise.all([
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
          where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' } },
        }),
      ]);

    await prisma.userSystemRole.createMany({
      data: [
        { userId: biniyamId, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
        { userId: platformAdminId, roleId: sysAdmin.id, roleScope: RoleScope.SYSTEM },
      ],
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: shewaFashionId,
          userId: biniyamId,
          roleId: orgOwner.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: debreBerhanId,
          userId: biniyamId,
          roleId: orgResearcher.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.ACTIVE,
        },
        {
          organizationId: shewaFashionId,
          userId: suspendedUserId,
          roleId: orgOwner.id,
          roleScope: RoleScope.ORGANIZATION,
          status: MembershipStatus.SUSPENDED,
        },
      ],
    });

    biniyamToken = signToken(biniyamId, uBiniyam.email);
    platformAdminToken = signToken(platformAdminId, uAdmin.email);
    suspendedToken = signToken(suspendedUserId, uSuspended.email);
  });

  afterAll(async () => {
    if (prisma) {
      if (createdOrgIds.length > 0) {
        await prisma.organizationMembership.deleteMany({
          where: { organizationId: { in: createdOrgIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: createdOrgIds } },
        });
      }
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
    }
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/authorization/system', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/authorization/system')
        .expect(401);
    });

    it('returns PARTICIPANT system permissions for Biniyam without org permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/authorization/system')
        .set('Authorization', `Bearer ${biniyamToken}`)
        .expect(200);

      expect(res.body.data.systemRoles).toEqual(['PARTICIPANT']);
      expect(res.body.data.permissions).toContain(PERMISSION.SURVEY_RESPOND);
      expect(res.body.data.permissions).not.toContain(PERMISSION.USERS_READ);
      expect(res.body.data.permissions).not.toContain(PERMISSION.RESEARCH_CREATE);
    });

    it('returns SYSTEM ADMIN permissions for platform admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/authorization/system')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(res.body.data.systemRoles).toEqual(['ADMIN']);
      expect(res.body.data.permissions).toContain(PERMISSION.USERS_READ);
      expect(res.body.data.permissions).toContain(PERMISSION.USERS_MANAGE);
    });
  });

  describe('GET /api/v1/authorization/organizations/:organizationId', () => {
    it('returns 401 when unauthenticated, 400 on bad UUID, 404 on missing org', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/authorization/organizations/${shewaFashionId}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/authorization/organizations/invalid-uuid')
        .set('Authorization', `Bearer ${biniyamToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get(
          '/api/v1/authorization/organizations/99999999-9999-4999-8999-999999999999',
        )
        .set('Authorization', `Bearer ${biniyamToken}`)
        .expect(404);
    });

    it('denies Platform ADMIN without org membership (403) and suspended members (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/authorization/organizations/${shewaFashionId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/authorization/organizations/${shewaFashionId}`)
        .set('Authorization', `Bearer ${suspendedToken}`)
        .expect(403);
    });

    it('returns OWNER permissions in Shewa Fashion and RESEARCHER permissions in Debre Berhan University for Biniyam', async () => {
      const shewaRes = await request(app.getHttpServer())
        .get(`/api/v1/authorization/organizations/${shewaFashionId}`)
        .set('Authorization', `Bearer ${biniyamToken}`)
        .expect(200);

      expect(shewaRes.body.data.roleCode).toBe('OWNER');
      expect(shewaRes.body.data.permissions).toContain(
        PERMISSION.ORGANIZATION_DELETE,
      );
      expect(shewaRes.body.data.permissions).toContain(
        PERMISSION.ORGANIZATION_MEMBERS_INVITE,
      );

      const dbuRes = await request(app.getHttpServer())
        .get(`/api/v1/authorization/organizations/${debreBerhanId}`)
        .set('Authorization', `Bearer ${biniyamToken}`)
        .expect(200);

      expect(dbuRes.body.data.roleCode).toBe('RESEARCHER');
      expect(dbuRes.body.data.permissions).toContain(PERMISSION.RESEARCH_CREATE);
      expect(dbuRes.body.data.permissions).not.toContain(
        PERMISSION.ORGANIZATION_DELETE,
      );
      expect(dbuRes.body.data.permissions).not.toContain(
        PERMISSION.ORGANIZATION_MEMBERS_INVITE,
      );
    });
  });
});
