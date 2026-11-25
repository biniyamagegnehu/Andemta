import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { PermissionsGuard } from './permissions.guard';
import { RolePermissionService } from '../services/role-permission.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PERMISSION, PermissionCode } from '../constants/permissions';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Reflector>;
  let rolePermissionService: jest.Mocked<
    Pick<RolePermissionService, 'userHasPermissions'>
  >;
  let jwtAuthGuard: jest.Mocked<Pick<JwtAuthGuard, 'canActivate'>>;

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
      userHasPermissions: jest.fn(),
    };

    jwtAuthGuard = {
      canActivate: jest.fn(),
    };

    guard = new PermissionsGuard(
      reflector,
      rolePermissionService as unknown as RolePermissionService,
      jwtAuthGuard as unknown as JwtAuthGuard,
    );
  });

  it('should allow request when no permission metadata is declared', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext({});

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(rolePermissionService.userHasPermissions).not.toHaveBeenCalled();
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
    expect(rolePermissionService.userHasPermissions).not.toHaveBeenCalled();
  });

  it('should reject with 401 if JwtAuthGuard returns false or observable error', async () => {
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

  it('should allow request when JwtAuthGuard populates user and user has permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const request: Record<string, unknown> = {};
    jwtAuthGuard.canActivate.mockImplementation(() => {
      request.user = { id: 'user-1', email: 'admin@andemta.et' };
      return of(true);
    });
    rolePermissionService.userHasPermissions.mockResolvedValue(true);

    const ctx = createMockContext(request);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(rolePermissionService.userHasPermissions).toHaveBeenCalledWith(
      'user-1',
      [PERMISSION.PLATFORM_ADMIN],
      undefined,
    );
  });

  it('should return 403 Forbidden when authenticated user lacks required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const ctx = createMockContext({ user: { id: 'user-1' } });
    rolePermissionService.userHasPermissions.mockResolvedValue(false);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should pass all required permissions (AND semantics) and valid UUID organizationId', async () => {
    const orgId = '11111111-2222-4333-8444-555555555555';
    reflector.getAllAndOverride.mockReturnValue([
      PERMISSION.RESEARCH_READ,
      PERMISSION.REPORTS_READ,
    ]);
    const ctx = createMockContext({
      user: { id: 'user-1' },
      params: { organizationId: orgId },
    });
    rolePermissionService.userHasPermissions.mockResolvedValue(true);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(rolePermissionService.userHasPermissions).toHaveBeenCalledWith(
      'user-1',
      [PERMISSION.RESEARCH_READ, PERMISSION.REPORTS_READ],
      orgId,
    );
  });

  it('should treat non-UUID organizationId param as undefined (fail closed for org routes)', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.RESEARCH_READ]);
    const ctx = createMockContext({
      user: { id: 'user-1' },
      params: { organizationId: 'not-a-valid-uuid' },
    });
    rolePermissionService.userHasPermissions.mockResolvedValue(false);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(rolePermissionService.userHasPermissions).toHaveBeenCalledWith(
      'user-1',
      [PERMISSION.RESEARCH_READ],
      undefined,
    );
  });

  it('should fail closed with 500 without leaking DB error details when service throws', async () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSION.PLATFORM_ADMIN]);
    const ctx = createMockContext({ user: { id: 'user-1' } });
    rolePermissionService.userHasPermissions.mockRejectedValue(
      new Error('Connection terminated unexpectedly: pg_hba.conf'),
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new InternalServerErrorException('Unable to verify authorization'),
    );
  });
});
