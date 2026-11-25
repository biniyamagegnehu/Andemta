import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrganizationContext } from '../interfaces/rbac.interfaces';

/**
 * Parameter decorator that retrieves the validated OrganizationContext
 * attached to the request by OrganizationAuthGuard or PermissionsGuard.
 *
 * Never trusts or resolves an organization ID independently; fails closed
 * if the guard has not populated request.organizationContext.
 *
 * Usage:
 *   @Get(':organizationId/research')
 *   list(@CurrentOrganization() org: OrganizationContext)
 *   // or
 *   list(@CurrentOrganization('organizationId') organizationId: string)
 */
export const CurrentOrganization = createParamDecorator(
  (
    data: keyof OrganizationContext | undefined,
    ctx: ExecutionContext,
  ): OrganizationContext | OrganizationContext[keyof OrganizationContext] => {
    const request = ctx.switchToHttp().getRequest<{
      organizationContext?: OrganizationContext;
    }>();

    const context = request.organizationContext;
    if (!context) {
      throw new InternalServerErrorException(
        'Organization context has not been validated',
      );
    }

    return data ? context[data] : context;
  },
);
