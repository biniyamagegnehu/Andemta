import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RbacModule, PermissionsGuard } from '../src/modules/rbac';
import { UsersModule } from '../src/modules/users/users.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { API_PREFIX } from '../src/common/constants';

jest.setTimeout(60000);

describe('Phase 5.1 — User Profile Management (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const createdUserIds: string[] = [];
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userAEmail: string;

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
        UsersModule,
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

    const suffix = Date.now();
    const [uA, uB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `profile-a-${suffix}@andemta.test`,
          passwordHash: 'argon2-secret-hash-must-not-leak',
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      }),
      prisma.user.create({
        data: {
          email: `profile-b-${suffix}@andemta.test`,
          passwordHash: 'argon2-secret-hash-b',
          emailVerifiedAt: new Date(),
          tokenVersion: 0,
        },
      }),
    ]);

    userAId = uA.id;
    userAEmail = uA.email;
    userBId = uB.id;
    createdUserIds.push(userAId, userBId);

    userAToken = jwtService.sign({
      sub: userAId,
      email: userAEmail,
      tokenVersion: 0,
    });
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/users/me', () => {
    it('rejects unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('returns authenticated user profile without sensitive fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: userAId,
        email: userAEmail,
        fullName: null,
        phoneNumber: null,
        preferredLanguage: 'en',
        bio: null,
      });
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('tokenVersion');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('rejects unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ fullName: 'Blocked' })
        .expect(401);
    });

    it('updates permitted profile fields and persists in PostgreSQL', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          fullName: '  Biniyam Tesfaye  ',
          phoneNumber: '+251911223344',
          preferredLanguage: 'am',
          bio: 'Ethiopian market research lead.',
        })
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: userAId,
        email: userAEmail,
        fullName: 'Biniyam Tesfaye',
        phoneNumber: '+251911223344',
        preferredLanguage: 'am',
        bio: 'Ethiopian market research lead.',
      });
      expect(res.body.data).not.toHaveProperty('passwordHash');

      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: userAId },
      });
      expect(dbUser.fullName).toBe('Biniyam Tesfaye');
      expect(dbUser.phoneNumber).toBe('+251911223344');
      expect(dbUser.preferredLanguage).toBe('am');
    });

    it('rejects invalid phoneNumber, too-short fullName, and unsupported preferredLanguage with 400', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fullName: 'A' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ phoneNumber: 'not-a-phone' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ preferredLanguage: 'fr' })
        .expect(400);
    });

    it('rejects unknown fields and security-sensitive fields (mass assignment & IDOR prevention)', async () => {
      for (const payload of [
        { id: userBId },
        { userId: userBId },
        { email: 'hijacked@andemta.et' },
        { passwordHash: 'hacked' },
        { tokenVersion: 99 },
        { emailVerifiedAt: null },
        { systemRoles: ['ADMIN'] },
        { unknownField: 'test' },
      ]) {
        await request(app.getHttpServer())
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${userAToken}`)
          .send(payload)
          .expect(400);
      }

      // Verify User B was never touched
      const dbUserB = await prisma.user.findUniqueOrThrow({
        where: { id: userBId },
      });
      expect(dbUserB.fullName).toBeNull();
    });
  });

  describe('Auth Regression (/auth/me)', () => {
    it('GET /api/v1/auth/me continues returning safe auth claims', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(userAId);
      expect(res.body.data.email).toBe(userAEmail);
    });
  });
});
