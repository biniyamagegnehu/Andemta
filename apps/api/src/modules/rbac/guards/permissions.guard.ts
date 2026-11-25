import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleScope } from '@prisma/client';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import {
  PermissionCode,
  isValidPermissionCode,
  getPermissionScope,
} from '../constants/permissions';
import { OrganizationContext } from '../interfaces/rbac.interfaces';
import { RolePermissionService } from '../services/role-permission.service';
import { OrganizationAuthorizationService } from '../services/organization-authorization.service';

/**
 * Runtime permission enforcement guard for the Andemta RBAC system.
 *
 * Behavior:
 * - Reads @RequirePermissions metadata using Reflector (handler overrides controller).
 * - If no permission metadata is declared, allows the request to proceed so
 *   public and non-RBAC routes remain backward-compatible.
 * - If permission metadata is declared, ensures JWT authentication has succeeded
 *   (delegating to JwtAuthGuard if request.user is not already populated).
 * - Validates metadata integrity; invalid/empty metadata fails closed with 500.
 * - For SYSTEM-scoped permissions, evaluates against UserSystemRole.
 * - For ORGANIZATION-scoped permissions, uses validated request.organizationContext
 *   (or validates via OrganizationAuthorizationService and attaches it to request).
 * - Enforces AND semantics across all declared permissions.
 * - Returns 401 for missing/invalid auth, 400 for malformed org ID, 404 for
 *   nonexistent org, and 403 for inactive org, missing/inactive membership, or
 *   insufficient permissions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissionService: RolePermissionService,
    @Optional() private readonly jwtAuthGuard?: JwtAuthGuard,
    @Optional()
    private readonly organizationAuthService?: OrganizationAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionCode[] | undefined
    >(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // No @RequirePermissions metadata -> backward-compatible pass-through
    if (requiredPermissions === undefined) {
      return true;
    }

    // Validate metadata integrity: fail safely on misconfigured routes
    if (
      !Array.isArray(requiredPermissions) ||
      requiredPermissions.length === 0 ||
      requiredPermissions.some(
        (code) => typeof code !== 'string' || !isValidPermissionCode(code),
      )
    ) {
      this.logger.error(
        'Invalid or empty permission metadata detected on route',
      );
      throw new InternalServerErrorException(
        'Authorization configuration error',
      );
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params?: Record<string, string | undefined>;
      organizationContext?: OrganizationContext;
    }>();

    // Step 1: Ensure JWT authentication has succeeded
    if (!request.user) {
      if (!this.jwtAuthGuard) {
        throw new UnauthorizedException('Authentication required');
      }

      const authResult = this.jwtAuthGuard.canActivate(context);
      const isAuthenticated = isObservable(authResult)
        ? await lastValueFrom(authResult)
        : await Promise.resolve(authResult);

      if (!isAuthenticated || !request.user) {
        throw new UnauthorizedException('Authentication required');
      }
    }

    const userId = request.user?.id;
    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const systemRequired: PermissionCode[] = [];
    const orgRequired: PermissionCode[] = [];

    for (const code of requiredPermissions) {
      if (getPermissionScope(code) === RoleScope.SYSTEM) {
        systemRequired.push(code);
      } else {
        orgRequired.push(code);
      }
    }

    try {
      // Step 2: Resolve and validate organization context if any org permission is required
      let orgGranted = new Set<PermissionCode>();
      if (orgRequired.length > 0) {
        if (
          request.organizationContext &&
          request.organizationContext.userId === userId
        ) {
          orgGranted = new Set(request.organizationContext.permissions);
        } else if (this.organizationAuthService) {
          const organizationId =
            this.organizationAuthService.extractOrganizationIdFromParams(
              request.params,
            );
          const orgContext =
            await this.organizationAuthService.validateOrganizationAccess(
              userId,
              organizationId,
            );
          request.organizationContext = orgContext;
          orgGranted = new Set(orgContext.permissions);
        } else {
          throw new ForbiddenException('Organization context is required');
        }
      }

      // Step 3: Evaluate system permissions (if any) + organization permissions (AND semantics)
      let systemGranted = new Set<PermissionCode>();
      if (systemRequired.length > 0) {
        systemGranted =
          await this.rolePermissionService.getUserSystemPermissions(userId);
      }

      const hasSystem = systemRequired.every((code) => systemGranted.has(code));
      const hasOrg = orgRequired.every((code) => orgGranted.has(code));

      if (!hasSystem || !hasOrg) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Database error while evaluating permissions for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new InternalServerErrorException(
        'Unable to verify authorization',
      );
    }
  }
}
