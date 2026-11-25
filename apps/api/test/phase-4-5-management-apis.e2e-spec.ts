import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  MembershipStatus,
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
import { RbacModule, PermissionsGuard } from '../src/modules/rbac';
import { OrganizationsModule } from '../src/modules/organizations/organizations.module';
import { AdminUsersModule } from '../src/modules/admin-users/admin-users.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';
import { runRbacSeed } from '../prisma/seed';

jest.setTimeout(60000);

describe('Phase 4.5 — User & Role Management APIs (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let creatorId: string;
  let secondUserId: string;
  let thirdUserId: string;
  let platformAdminId: string;
  let secondPlatformAdminId: string;

  let creatorToken: string;
  let secondUserToken: string;
  let thirdUserToken: string;
  let platformAdminToken: string;

  let org1Id: string;
  let org2Id: string;
  let org1SecondUserMembershipId: string;
  let org2CreatorMembershipId: string;

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
      imports: [
        AppConfigModule,
        DatabaseModule,
        RedisModule,
        AuthModule,
        RbacModule,
        OrganizationsModule,
        AdminUsersModule,
      ],
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
    app.useGlobalPipes(createGlobalValidationPipe());
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
          email: `rbac45-${tag}-${suffix}@andemta.test`,
          passwordHash: 'argon2-secret-hash-must-never-leak',
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const [uCreator, uSecond, uThird, uPlatformAdmin, uSecondAdmin] =
      await Promise.all([
        createTestUser('creator'),
        createTestUser('second'),
        createTestUser('third'),
        createTestUser('padmin1'),
        createTestUser('padmin2'),
      ]);

    creatorId = uCreator.id;
    secondUserId = uSecond.id;
    thirdUserId = uThird.id;
    platformAdminId = uPlatformAdmin.id;
    secondPlatformAdminId = uSecondAdmin.id;

    const [sysParticipantRole, sysAdminRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'PARTICIPANT' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.SYSTEM, code: 'ADMIN' } },
      }),
    ]);

    await prisma.userSystemRole.createMany({
      data: [
        { userId: creatorId, roleId: sysParticipantRole.id, roleScope: RoleScope.SYSTEM },
        { userId: secondUserId, roleId: sysParticipantRole.id, roleScope: RoleScope.SYSTEM },
        { userId: platformAdminId, roleId: sysAdminRole.id, roleScope: RoleScope.SYSTEM },
        { userId: secondPlatformAdminId, roleId: sysAdminRole.id, roleScope: RoleScope.SYSTEM },
      ],
    });

    creatorToken = signTokenForUser(creatorId, uCreator.email);
    secondUserToken = signTokenForUser(secondUserId, uSecond.email);
    thirdUserToken = signTokenForUser(thirdUserId, uThird.email);
    platformAdminToken = signTokenForUser(platformAdminId, uPlatformAdmin.email);
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

  // ---------------------------------------------------------------------------
  // Part 1: Organization Management APIs
  // ---------------------------------------------------------------------------
  describe('Organization Management', () => {
    it('POST /organizations creates org and assigns creator OWNER membership', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Andemta Research Hub',
          type: OrganizationType.BUSINESS,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.roleCode).toBe('OWNER');
      expect(res.body.data.name).toBe('Andemta Research Hub');
      org1Id = res.body.data.id;
      createdOrgIds.push(org1Id);
    });

    it('POST /organizations rejects unexpected fields like status or role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name: 'Malicious Org',
          role: 'ADMIN',
        })
        .expect(400);
    });

    it('GET /organizations lists only organizations where user has active membership', async () => {
      // Create second org owned by secondUser
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ name: 'Second User University', type: OrganizationType.UNIVERSITY })
        .expect(201);
      org2Id = res2.body.data.id;
      createdOrgIds.push(org2Id);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const ids = listRes.body.data.items.map((o: { id: string }) => o.id);
      expect(ids).toContain(org1Id);
      expect(ids).not.toContain(org2Id);
    });

    it('GET /organizations/:organizationId denies unrelated user with 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${org1Id}`)
        .set('Authorization', `Bearer ${thirdUserToken}`)
        .expect(403);
    });

    it('PATCH /organizations/:organizationId rejects status modification and updates permitted fields', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${org1Id}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${org1Id}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ name: 'Andemta Research Hub Updated' })
        .expect(200);

      expect(patchRes.body.data.name).toBe('Andemta Research Hub Updated');
    });
  });

  // ---------------------------------------------------------------------------
  // Part 2: Organization Membership Management APIs
  // ---------------------------------------------------------------------------
  describe('Organization Membership Management', () => {
    it('OWNER adds secondUser as ADMIN and rejects SYSTEM role assignment', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ userId: secondUserId, roleCode: 'PARTICIPANT' })
        .expect(400);

      const addRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ userId: secondUserId, roleCode: 'ADMIN' })
        .expect(201);

      org1SecondUserMembershipId = addRes.body.data.id;
      expect(addRes.body.data.roleCode).toBe('ADMIN');
    });

    it('prevents duplicate active membership with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ userId: secondUserId, roleCode: 'RESEARCHER' })
        .expect(409);
    });

    it('Organization ADMIN cannot assign OWNER role (privilege escalation denied)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ userId: thirdUserId, roleCode: 'OWNER' })
        .expect(403);
    });

    it('Organization ADMIN can add thirdUser as VIEWER, and VIEWER cannot manage members', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ userId: thirdUserId, roleCode: 'VIEWER' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${thirdUserToken}`)
        .send({ userId: platformAdminId, roleCode: 'VIEWER' })
        .expect(403);
    });

    it('GET /organizations/:organizationId/members lists active members without secrets', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${org1Id}/members`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
      for (const m of res.body.data.items) {
        expect(m).not.toHaveProperty('passwordHash');
        expect(m).not.toHaveProperty('tokenVersion');
      }
    });

    it('prevents cross-organization membership IDOR on role change', async () => {
      // secondUser owns org2; try modifying org1's membership via org2's route
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${org2Id}/members/${org1SecondUserMembershipId}/role`,
        )
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ roleCode: 'VIEWER' })
        .expect(404);
    });

    it('protects last OWNER from demotion and removal', async () => {
      const ownerMem = await prisma.organizationMembership.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: secondUserId,
            organizationId: org2Id,
          },
        },
      });
      org2CreatorMembershipId = ownerMem.id;

      // Add creator as ADMIN in org2 so creator can try to demote/remove org2's last OWNER
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org2Id}/members`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ userId: creatorId, roleCode: 'ADMIN' })
        .expect(201);

      // ADMIN cannot demote/remove OWNER (403)
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${org2Id}/members/${org2CreatorMembershipId}/role`,
        )
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ roleCode: 'VIEWER' })
        .expect(403);

      // Even OWNER cannot remove the last OWNER (409)
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${org2Id}/members/${org2CreatorMembershipId}`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .expect(409);
    });

    it('removing a member deactivates membership and immediately revokes access', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/organizations/${org1Id}/members/${org1SecondUserMembershipId}`,
        )
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      // Historical record preserved with INACTIVE status
      const mem = await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: org1SecondUserMembershipId },
      });
      expect(mem.status).toBe(MembershipStatus.INACTIVE);

      // Access to org1 is immediately revoked
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${org1Id}`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Part 3: Platform User Management APIs
  // ---------------------------------------------------------------------------
  describe('Platform User Management (Admin Users)', () => {
    it('denies non-admin and Organization ADMIN users from /admin/users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(403);
    });

    it('Platform ADMIN can list users and inspect user details without leaking secrets', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/admin/users?limit=10')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(listRes.body.data.items.length).toBeGreaterThan(0);
      for (const u of listRes.body.data.items) {
        expect(u).not.toHaveProperty('passwordHash');
        expect(u).not.toHaveProperty('tokenVersion');
      }

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${creatorId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(creatorId);
      expect(detailRes.body.data).not.toHaveProperty('passwordHash');
      expect(detailRes.body.data).not.toHaveProperty('tokenVersion');
    });

    it('rejects organization role assignment on system-roles endpoint', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${thirdUserId}/system-roles`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roleCode: 'OWNER' })
        .expect(400);
    });

    it('prevents self-modification and allows assigning/revoking system role on another user', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${platformAdminId}/system-roles`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roleCode: 'PARTICIPANT' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${thirdUserId}/system-roles`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roleCode: 'PARTICIPANT' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/users/${thirdUserId}/system-roles/PARTICIPANT`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Regression Check
  // ---------------------------------------------------------------------------
  describe('Authentication Regression', () => {
    it('GET /api/v1/auth/me works for authenticated user and rejects unauthenticated', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(creatorId);
    });
  });
});
