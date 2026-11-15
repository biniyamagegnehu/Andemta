import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JWT_STRATEGY_NAME } from '../constants/auth.constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {
  /**
   * Customizes error handling and message clarity when authentication fails.
   */
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: { name?: string; message?: string } | null | undefined,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      let errorMessage = 'Unauthorized access';

      if (info?.name === 'TokenExpiredError' || info?.message === 'jwt expired') {
        errorMessage = 'Access token has expired';
      } else if (
        info?.name === 'JsonWebTokenError' ||
        info?.message === 'invalid signature' ||
        info?.message === 'jwt malformed'
      ) {
        errorMessage = 'Invalid access token';
      } else if (info?.message === 'No auth token') {
        errorMessage = 'Missing Bearer authentication token';
      } else if (info?.message) {
        errorMessage = info.message;
      }

      throw err || new UnauthorizedException(errorMessage);
    }

    return user;
  }
}
