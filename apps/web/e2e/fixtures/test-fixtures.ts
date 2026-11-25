import fs from 'fs';
import path from 'path';
import argon2 from 'argon2';
import { PrismaClient, MembershipStatus, OrganizationStatus, OrganizationType, RoleScope } from '@prisma/client';
import type { Page } from '@playwright/test';

export const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4001';

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const apiEnvPath = path.resolve(__dirname, '../../../api/.env');
  if (fs.existsSync(apiEnvPath)) {
    const content = fs.readFileSync(apiEnvPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.+)$/);
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
}

export interface TestUserFixture {
  id: string;
  email: string;
  password: string;
}

export interface Phase48Fixtures {
  biniyam: TestUserFixture;
  viewerUser: TestUserFixture;
  orgAdminUser: TestUserFixture;
  platformAdminUser: TestUserFixture;
  suspendedMemberUser: TestUserFixture;
  shewaFashionId: string;
  debreBerhanId: string;
  unrelatedOrgId: string;
  cleanup: () => Promise<void>;
}

export async function setupPhase48Fixtures(): Promise<Phase48Fixtures> {
  ensureDatabaseUrl();
  const prisma = new PrismaClient();
  await prisma.$connect();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = 'AndemtaE2e!Password2026';
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  async function registerAndVerifyUser(tag: string): Promise<TestUserFixture> {
    const email = `e2e48-${tag}-${suffix}@andemta.test`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        tokenVersion: 0,
      },
      select: { id: true, email: true },
    });

    createdUserIds.push(user.id);
    return { id: user.id, email: user.email, password };
  }

  const [biniyam, viewerUser, orgAdminUser, platformAdminUser, suspendedMemberUser] =
    await Promise.all([
      registerAndVerifyUser('biniyam'),
      registerAndVerifyUser('viewer'),
      registerAndVerifyUser('orgadmin'),
      registerAndVerifyUser('platformadmin'),
      registerAndVerifyUser('suspended'),
    ]);

  const [shewa, dbu, unrelated] = await Promise.all([
    prisma.organization.create({
      data: {
        name: `Shewa Fashion ${suffix}`,
        slug: `shewa-fashion-${suffix}`,
        type: OrganizationType.BUSINESS,
        status: OrganizationStatus.ACTIVE,
      },
    }),
    prisma.organization.create({
      data: {
        name: `Debre Berhan University ${suffix}`,
        slug: `dbu-${suffix}`,
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
      },
    }),
    prisma.organization.create({
      data: {
        name: `Unrelated Org ${suffix}`,
        slug: `unrelated-${suffix}`,
        type: OrganizationType.OTHER,
        status: OrganizationStatus.ACTIVE,
      },
    }),
  ]);

  createdOrgIds.push(shewa.id, dbu.id, unrelated.id);

  const [sysParticipant, sysAdmin, orgOwner, orgAdmin, orgResearcher, orgViewer] =
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
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'ADMIN' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'RESEARCHER' } },
      }),
      prisma.role.findUniqueOrThrow({
        where: { scope_code: { scope: RoleScope.ORGANIZATION, code: 'VIEWER' } },
      }),
    ]);

  // Assign system roles (register already assigns PARTICIPANT or none depending on flow; ensure clean state)
  await prisma.userSystemRole.deleteMany({
    where: { userId: { in: createdUserIds } },
  });

  await prisma.userSystemRole.createMany({
    data: [
      { userId: biniyam.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
      { userId: viewerUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
      { userId: orgAdminUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
      { userId: platformAdminUser.id, roleId: sysAdmin.id, roleScope: RoleScope.SYSTEM },
      { userId: suspendedMemberUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
    ],
  });

  await prisma.organizationMembership.createMany({
    data: [
      // Biniyam: OWNER in Shewa Fashion, RESEARCHER in Debre Berhan University
      {
        organizationId: shewa.id,
        userId: biniyam.id,
        roleId: orgOwner.id,
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.ACTIVE,
      },
      {
        organizationId: dbu.id,
        userId: biniyam.id,
        roleId: orgResearcher.id,
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.ACTIVE,
      },
      // Viewer in Shewa Fashion
      {
        organizationId: shewa.id,
        userId: viewerUser.id,
        roleId: orgViewer.id,
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.ACTIVE,
      },
      // Org Admin in Shewa Fashion
      {
        organizationId: shewa.id,
        userId: orgAdminUser.id,
        roleId: orgAdmin.id,
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.ACTIVE,
      },
      // Suspended member in Shewa Fashion
      {
        organizationId: shewa.id,
        userId: suspendedMemberUser.id,
        roleId: orgOwner.id,
        roleScope: RoleScope.ORGANIZATION,
        status: MembershipStatus.SUSPENDED,
      },
    ],
  });

  const cleanup = async () => {
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: createdOrgIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrgIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.userSystemRole.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.$disconnect();
  };

  return {
    biniyam,
    viewerUser,
    orgAdminUser,
    platformAdminUser,
    suspendedMemberUser,
    shewaFashionId: shewa.id,
    debreBerhanId: dbu.id,
    unrelatedOrgId: unrelated.id,
    cleanup,
  };
}

/**
 * Logs in a test user through the real /login UI form and waits for navigation.
 */
export async function loginViaUi(
  page: Page,
  user: TestUserFixture,
  expectedPathPrefix = '/dashboard',
): Promise<void> {
  await page.goto(`/login?returnUrl=${encodeURIComponent(expectedPathPrefix)}`);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith(expectedPathPrefix), {
    timeout: 15_000,
  });
}
