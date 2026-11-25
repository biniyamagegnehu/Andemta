import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { OrganizationContext } from '../interfaces/rbac.interfaces';
import { OrganizationAuthorizationService } from '../services/organization-authorization.service';

/**
 * Guard that validates organization context and active membership before
 * organization-scoped route handlers or permission checks execute.
 *
 * Execution flow:
 * 1. Ensures request.user is authenticated (delegating to JwtAuthGuard if needed).
 * 2. Extracts organizationId from trusted route parameters (:organizationId or :orgId).
 * 3. Validates organization existence/status and active user membership via
 *    OrganizationAuthorizationService (400 / 404 / 403).
 * 4. Attaches validated OrganizationContext to request.organizationContext.
 */
@Injectable()
export class OrganizationAuthGuard implements CanActivate {
  private readonly logger = new Logger(OrganizationAuthGuard.name);

  constructor(
    private readonly organizationAuthService: OrganizationAuthorizationService,
    @Optional() private readonly jwtAuthGuard?: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params?: Record<string, string | undefined>;
      organizationContext?: OrganizationContext;
    }>();

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

    const organizationId =
      this.organizationAuthService.extractOrganizationIdFromParams(
        request.params,
      );

    // If already validated by an earlier guard in this request lifecycle for the
    // exact same user and organization, reuse without duplicating the DB lookup.
    if (
      request.organizationContext &&
      request.organizationContext.userId === userId &&
      request.organizationContext.organizationId === organizationId
    ) {
      return true;
    }

    try {
      const orgContext =
        await this.organizationAuthService.validateOrganizationAccess(
          userId,
          organizationId,
        );
      request.organizationContext = orgContext;
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Unexpected error validating organization access for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw new InternalServerErrorException(
        'Unable to verify organization authorization',
      );
    }
  }
}
