import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationType } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { PermissionsGuard } from './permissions.guard';
import { RolePermissionService } from '../services/role-permission.service';
import { OrganizationAuthorizationService } from '../services/organization-authorization.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PERMISSION, PermissionCode } from '../constants/permissions';
import { OrganizationContext } from '../interfaces/rbac.interfaces';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Reflector>;
  let rolePermissionService: jest.Mocked<
    Pick<RolePermissionService, 'getUserSystemPermissions'>
  >;
  let orgAuthService: jest.Mocked<
    Pick<
      OrganizationAuthorizationService,
      'extractOrganizationIdFromParams' | 'validateOrganizationAccess'
    >
  >;
  let jwtAuthGuard: jest.Mocked<Pick<JwtAuthGuard, 'canActivate'>>;

  const validOrgId = '11111111-2222-4333-8444-555555555555';

  const createMockContext = (
    request: Record<string, unknown> = {},
  ): ExecutionContext => {
    const handler = () => {};
    class DummyController {}
    return {
      getHandler: () => handler,
      getClass: () => DummyController,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    rolePermissionService = {
      getUserSystemPermissions: jest.fn(),
    };

    orgAuthService = {
      extractOrganizationIdFromParams: jest.fn(),
      validateOrganizationAccess: jest.fn(),
    };

    jwtAuthGuard = {
      canActivate: jest.fn(),
    };

    guard = new PermissionsGuard(
      reflector,
      rolePermissionService as unknown as RolePermissionService,
      jwtAuthGuard as unknown as JwtAuthGuard,
      orgAuthService as unknown as OrganizationAuthorizationService,
    );
  });

  it('should allow request when no permission metadata is declared', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext({});

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(rolePermissionService.getUserSystemPermissions).not.toHaveBeenCalled();
  });

  it('should fail safely with 500 when permission metadata is empty array', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = createMockContext({ user: { id: 'user-1' } });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('should fail safely with 500 when permission metadata contains unknown code', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'unknown.permission' as PermissionCode,
    ]);
    const ctx = createMockContext({ user: { id: 'user-1' } });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('should delegate to JwtAuthGuard when request.user is missing and propagate 401', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    jwtAuthGuard.canActivate.mockImplementation(() => {
      throw new UnauthorizedException('Missing Bearer authentication token');
    });
    const ctx = createMockContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(jwtAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
  });

  it('should reject with 401 if JwtAuthGuard returns observable error', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    jwtAuthGuard.canActivate.mockReturnValue(
      throwError(() => new UnauthorizedException('Invalid access token')),
    );
    const ctx = createMockContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject with 401 when JwtAuthGuard is not provided and user is missing', async () => {
    const standaloneGuard = new PermissionsGuard(
      reflector,
      rolePermissionService as unknown as RolePermissionService,
    );
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const ctx = createMockContext({});

    await expect(standaloneGuard.canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should allow request when JwtAuthGuard populates user and user has system permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const request: Record<string, unknown> = {};
    jwtAuthGuard.canActivate.mockImplementation(() => {
      request.user = { id: 'user-1', email: 'admin@andemta.et' };
      return of(true);
    });
    rolePermissionService.getUserSystemPermissions.mockResolvedValue(
      new Set([PERMISSION.PLATFORM_ADMIN]),
    );

    const ctx = createMockContext(request);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(rolePermissionService.getUserSystemPermissions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('should return 403 Forbidden when authenticated user lacks required system permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const ctx = createMockContext({ user: { id: 'user-1' } });
    rolePermissionService.getUserSystemPermissions.mockResolvedValue(new Set());

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should reuse pre-validated request.organizationContext and enforce AND semantics', async () => {
    const orgContext: OrganizationContext = {
      organizationId: validOrgId,
      organizationType: OrganizationType.BUSINESS,
      userId: 'user-1',
      membershipId: 'mem-1',
      roleCode: 'RESEARCHER',
      permissions: [PERMISSION.RESEARCH_READ, PERMISSION.REPORTS_READ],
    };
    reflector.getAllAndOverride.mockReturnValue([
      PERMISSION.RESEARCH_READ,
      PERMISSION.REPORTS_READ,
    ]);
    const ctx = createMockContext({
      user: { id: 'user-1' },
      params: { organizationId: validOrgId },
      organizationContext: orgContext,
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(orgAuthService.validateOrganizationAccess).not.toHaveBeenCalled();
  });

  it('should validate organization access via OrganizationAuthorizationService when not pre-populated', async () => {
    const orgContext: OrganizationContext = {
      organizationId: validOrgId,
      organizationType: OrganizationType.BUSINESS,
      userId: 'user-1',
      membershipId: 'mem-1',
      roleCode: 'VIEWER',
      permissions: [PERMISSION.RESEARCH_READ],
    };
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.RESEARCH_READ]);
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue(validOrgId);
    orgAuthService.validateOrganizationAccess.mockResolvedValue(orgContext);

    const request: Record<string, unknown> = {
      user: { id: 'user-1' },
      params: { organizationId: validOrgId },
    };
    const result = await guard.canActivate(createMockContext(request));

    expect(result).toBe(true);
    expect(request.organizationContext).toEqual(orgContext);
  });

  it('should propagate 400 and 404 from OrganizationAuthorizationService', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.RESEARCH_READ]);
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue('bad-id');

    orgAuthService.validateOrganizationAccess.mockRejectedValueOnce(
      new BadRequestException('Invalid organization ID format'),
    );
    await expect(
      guard.canActivate(createMockContext({ user: { id: 'user-1' } })),
    ).rejects.toThrow(BadRequestException);

    orgAuthService.validateOrganizationAccess.mockRejectedValueOnce(
      new NotFoundException('Organization not found'),
    );
    await expect(
      guard.canActivate(createMockContext({ user: { id: 'user-1' } })),
    ).rejects.toThrow(NotFoundException);
  });

  it('should fail closed with 500 without leaking DB error details when service throws', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const ctx = createMockContext({ user: { id: 'user-1' } });
    rolePermissionService.getUserSystemPermissions.mockRejectedValue(
      new Error('Connection terminated unexpectedly: pg_hba.conf'),
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new InternalServerErrorException('Unable to verify authorization'),
    );
  });
});
