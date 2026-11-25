import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import {
  RequirePermissions,
  REQUIRED_PERMISSIONS_KEY,
} from './require-permissions.decorator';
import { PERMISSION, PermissionCode } from '../constants/permissions';

describe('@RequirePermissions Decorator', () => {
  const reflector = new Reflector();

  it('should attach single permission metadata to a handler', () => {
    class TestController {
      @RequirePermissions(PERMISSION.RESEARCH_CREATE)
      create() {}
    }

    const metadata = reflector.get<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      TestController.prototype.create,
    );

    expect(metadata).toEqual([PERMISSION.RESEARCH_CREATE]);
  });

  it('should attach multiple permissions metadata and deduplicate duplicates', () => {
    class TestController {
      @RequirePermissions(
        PERMISSION.RESEARCH_READ,
        PERMISSION.REPORTS_READ,
        PERMISSION.RESEARCH_READ,
      )
      read() {}
    }

    const metadata = reflector.get<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      TestController.prototype.read,
    );

    expect(metadata).toEqual([
      PERMISSION.RESEARCH_READ,
      PERMISSION.REPORTS_READ,
    ]);
  });

  it('should reject empty permission definitions at decoration time', () => {
    expect(() => {
      RequirePermissions();
    }).toThrow('@RequirePermissions requires at least one valid PermissionCode.');
  });

  it('should reject invalid permission codes at decoration time', () => {
    expect(() => {
      RequirePermissions('invalid.permission.code' as PermissionCode);
    }).toThrow(
      'Invalid permission code supplied to @RequirePermissions: "invalid.permission.code".',
    );
  });

  it('should allow handler-level metadata to override controller-level metadata', () => {
    @RequirePermissions(PERMISSION.ORGANIZATION_READ)
    class OrgController {
      @RequirePermissions(PERMISSION.ORGANIZATION_UPDATE)
      update() {}

      read() {}
    }

    const updateMetadata = reflector.getAllAndOverride<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      [OrgController.prototype.update, OrgController],
    );
    const readMetadata = reflector.getAllAndOverride<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      [OrgController.prototype.read, OrgController],
    );

    expect(updateMetadata).toEqual([PERMISSION.ORGANIZATION_UPDATE]);
    expect(readMetadata).toEqual([PERMISSION.ORGANIZATION_READ]);
  });
});
