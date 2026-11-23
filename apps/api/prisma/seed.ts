import { PrismaClient, RoleScope } from '@prisma/client';
import {
  SYSTEM_ROLES,
  ORGANIZATION_ROLES,
  INITIAL_PERMISSIONS,
  ROLE_PERMISSION_MAPPINGS,
} from './rbac-data';

const prisma = new PrismaClient();

export interface SeedSummary {
  rolesProcessed: number;
  permissionsProcessed: number;
  rolePermissionsProcessed: number;
  usersBackfilled: number;
}

/**
 * Idempotently seeds the built-in system and organization roles into the database.
 */
export async function seedRoles(client: PrismaClient = prisma): Promise<number> {
  const allRoles = [...SYSTEM_ROLES, ...ORGANIZATION_ROLES];
  let count = 0;

  for (const roleDef of allRoles) {
    await client.role.upsert({
      where: {
        scope_code: {
          scope: roleDef.scope,
          code: roleDef.code,
        },
      },
      create: {
        scope: roleDef.scope,
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        isBuiltIn: true,
        isActive: true,
      },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        isBuiltIn: true,
        isActive: true,
      },
    });
    count++;
  }

  return count;
}

/**
 * Idempotently seeds the initial catalog of permissions into the database.
 */
export async function seedPermissions(client: PrismaClient = prisma): Promise<number> {
  let count = 0;

  for (const permDef of INITIAL_PERMISSIONS) {
    await client.permission.upsert({
      where: {
        code: permDef.code,
      },
      create: {
        code: permDef.code,
        name: permDef.name,
        description: permDef.description,
        isActive: true,
      },
      update: {
        name: permDef.name,
        description: permDef.description,
        isActive: true,
      },
    });
    count++;
  }

  return count;
}

/**
 * Idempotently maps initial permissions to roles based on the principle of least privilege.
 */
export async function seedRolePermissions(client: PrismaClient = prisma): Promise<number> {
  const roles = await client.role.findMany();
  const permissions = await client.permission.findMany();

  const roleMap = new Map<string, string>();
  for (const role of roles) {
    roleMap.set(`${role.scope}:${role.code}`, role.id);
  }

  const permissionMap = new Map<string, string>();
  for (const perm of permissions) {
    permissionMap.set(perm.code, perm.id);
  }

  let count = 0;

  for (const [roleKey, permCodes] of Object.entries(ROLE_PERMISSION_MAPPINGS)) {
    const roleId = roleMap.get(roleKey);
    if (!roleId) {
      throw new Error(`Role not found in database for key: ${roleKey}`);
    }

    for (const permCode of permCodes) {
      const permissionId = permissionMap.get(permCode);
      if (!permissionId) {
        throw new Error(`Permission not found in database for code: ${permCode}`);
      }

      await client.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId,
          },
        },
        create: {
          roleId,
          permissionId,
        },
        update: {},
      });
      count++;
    }
  }

  return count;
}

/**
 * Safe, explicit backfill strategy for existing users.
 * Assigns the default PARTICIPANT system role to any user currently without a system role.
 * Never assigns platform ADMIN or any elevated roles.
 * Never creates organization memberships.
 */
export async function backfillParticipantRoleForExistingUsers(
  client: PrismaClient = prisma,
): Promise<number> {
  const participantRole = await client.role.findUnique({
    where: {
      scope_code: {
        scope: RoleScope.SYSTEM,
        code: 'PARTICIPANT',
      },
    },
  });

  if (!participantRole) {
    throw new Error('System PARTICIPANT role must exist before running backfill.');
  }

  // Find all users who do not have any system role assigned
  const unassignedUsers = await client.user.findMany({
    where: {
      systemRoles: {
        none: {},
      },
    },
    select: {
      id: true,
    },
  });

  let backfilled = 0;
  for (const user of unassignedUsers) {
    await client.userSystemRole.create({
      data: {
        userId: user.id,
        roleId: participantRole.id,
        roleScope: RoleScope.SYSTEM,
      },
    });
    backfilled++;
  }

  return backfilled;
}

/**
 * Primary seed orchestrator.
 */
export async function runRbacSeed(
  client: PrismaClient = prisma,
  options: { backfillUsers?: boolean } = { backfillUsers: true },
): Promise<SeedSummary> {
  const rolesProcessed = await seedRoles(client);
  const permissionsProcessed = await seedPermissions(client);
  const rolePermissionsProcessed = await seedRolePermissions(client);

  let usersBackfilled = 0;
  if (options.backfillUsers) {
    usersBackfilled = await backfillParticipantRoleForExistingUsers(client);
  }

  return {
    rolesProcessed,
    permissionsProcessed,
    rolePermissionsProcessed,
    usersBackfilled,
  };
}

// Standalone execution entrypoint
if (require.main === module) {
  runRbacSeed()
    .then((summary) => {
      // eslint-disable-next-line no-console
      console.log('✅ RBAC Database Foundation Seed completed successfully:', summary);
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('❌ RBAC Seed failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
