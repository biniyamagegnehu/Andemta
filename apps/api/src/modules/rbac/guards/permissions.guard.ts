import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import {
  PermissionCode,
  isValidPermissionCode,
} from '../constants/permissions';
import { RolePermissionService } from '../services/role-permission.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * - Checks permissions against trusted PostgreSQL records via RolePermissionService
 *   using AND semantics and strict SYSTEM vs ORGANIZATION scope isolation.
 * - Returns 401 for missing/invalid authentication and 403 for insufficient permissions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissionService: RolePermissionService,
    @Optional() private readonly jwtAuthGuard?: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler-level metadata overrides controller-level metadata when present;
    // otherwise inherit controller-level metadata.
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
    }>();

    // Ensure authentication has been established using the existing JwtAuthGuard
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

    const rawOrgId =
      request.params?.organizationId ?? request.params?.orgId ?? undefined;
    const organizationId =
      typeof rawOrgId === 'string' && UUID_REGEX.test(rawOrgId)
        ? rawOrgId
        : undefined;

    let hasPermissions: boolean;
    try {
      hasPermissions = await this.rolePermissionService.userHasPermissions(
        userId,
        requiredPermissions,
        organizationId,
      );
    } catch (error) {
      this.logger.error(
        `Database error while evaluating permissions for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new InternalServerErrorException(
        'Unable to verify authorization',
      );
    }

    if (!hasPermissions) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
