import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { of } from 'rxjs';
import { OrganizationAuthGuard } from './organization-auth.guard';
import { OrganizationAuthorizationService } from '../services/organization-authorization.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PERMISSION } from '../constants/permissions';
import { OrganizationContext } from '../interfaces/rbac.interfaces';

describe('OrganizationAuthGuard', () => {
  let guard: OrganizationAuthGuard;
  let orgAuthService: jest.Mocked<OrganizationAuthorizationService>;
  let jwtAuthGuard: jest.Mocked<Pick<JwtAuthGuard, 'canActivate'>>;

  const validOrgId = '11111111-2222-4333-8444-555555555555';
  const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  const createMockContext = (
    request: Record<string, unknown> = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    orgAuthService = {
      extractOrganizationIdFromParams: jest.fn(),
      validateOrganizationAccess: jest.fn(),
    } as unknown as jest.Mocked<OrganizationAuthorizationService>;

    jwtAuthGuard = {
      canActivate: jest.fn(),
    };

    guard = new OrganizationAuthGuard(
      orgAuthService,
      jwtAuthGuard as unknown as JwtAuthGuard,
    );
  });

  it('delegates to JwtAuthGuard when request.user is missing and propagates 401', async () => {
    jwtAuthGuard.canActivate.mockImplementation(() => {
      throw new UnauthorizedException('Missing Bearer authentication token');
    });

    await expect(guard.canActivate(createMockContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(orgAuthService.validateOrganizationAccess).not.toHaveBeenCalled();
  });

  it('populates request.organizationContext on valid organization access', async () => {
    const request: Record<string, unknown> = {
      params: { organizationId: validOrgId },
    };
    const expectedContext: OrganizationContext = {
      organizationId: validOrgId,
      organizationType: OrganizationType.BUSINESS,
      userId,
      membershipId: 'mem-1',
      roleCode: 'OWNER',
      permissions: [PERMISSION.ORGANIZATION_READ],
    };

    jwtAuthGuard.canActivate.mockImplementation(() => {
      request.user = { id: userId, email: 'owner@andemta.et' };
      return of(true);
    });
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue(validOrgId);
    orgAuthService.validateOrganizationAccess.mockResolvedValue(expectedContext);

    const result = await guard.canActivate(createMockContext(request));

    expect(result).toBe(true);
    expect(request.organizationContext).toEqual(expectedContext);
  });

  it('reuses already validated request.organizationContext for same user and org', async () => {
    const existingContext: OrganizationContext = {
      organizationId: validOrgId,
      organizationType: OrganizationType.BUSINESS,
      userId,
      membershipId: 'mem-1',
      roleCode: 'OWNER',
      permissions: [PERMISSION.ORGANIZATION_READ],
    };
    const request: Record<string, unknown> = {
      user: { id: userId },
      params: { organizationId: validOrgId },
      organizationContext: existingContext,
    };
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue(validOrgId);

    const result = await guard.canActivate(createMockContext(request));

    expect(result).toBe(true);
    expect(orgAuthService.validateOrganizationAccess).not.toHaveBeenCalled();
  });

  it('propagates 400 BadRequestException, 404 NotFoundException, and 403 ForbiddenException', async () => {
    const request = {
      user: { id: userId },
      params: { organizationId: 'bad-id' },
    };
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue('bad-id');

    orgAuthService.validateOrganizationAccess.mockRejectedValueOnce(
      new BadRequestException('Invalid organization ID format'),
    );
    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      BadRequestException,
    );

    orgAuthService.validateOrganizationAccess.mockRejectedValueOnce(
      new NotFoundException('Organization not found'),
    );
    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      NotFoundException,
    );

    orgAuthService.validateOrganizationAccess.mockRejectedValueOnce(
      new ForbiddenException('You do not have access to this organization'),
    );
    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('fails closed with 500 without leaking DB details on unexpected error', async () => {
    const request = {
      user: { id: userId },
      params: { organizationId: validOrgId },
    };
    orgAuthService.extractOrganizationIdFromParams.mockReturnValue(validOrgId);
    orgAuthService.validateOrganizationAccess.mockRejectedValue(
      new Error('ECONNREFUSED 127.0.0.1:5432'),
    );

    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      new InternalServerErrorException(
        'Unable to verify organization authorization',
      ),
    );
  });
});
