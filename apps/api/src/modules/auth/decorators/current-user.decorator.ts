import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Parameter decorator that extracts the authenticated user object (or a specific property)
 * attached to request.user by JwtStrategy.
 *
 * Usage:
 *   @Get('me')
 *   getProfile(@CurrentUser() user: AuthenticatedUser)
 *   or:
 *   getProfile(@CurrentUser('id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    return data ? user?.[data] : user;
  },
);
