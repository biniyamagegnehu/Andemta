import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Foundation guard serving as the architectural template for future
 * authentication and RBAC authorization guards in subsequent phases.
 */
@Injectable()
export class BaseGuard implements CanActivate {
  protected readonly logger = new Logger(BaseGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(
      `[BaseGuard] Request permitted for: ${request.method} ${request.url}`,
    );

    // Extension point: in Phase 3, this will inspect JWT bearer tokens
    // and verify role claims from request headers or signed cookies.
    return true;
  }
}

