import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override logger = new Logger(AppThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return true;
    }
    return super.canActivate(context);
  }

  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    // In test environment:
    // - If explicit test tracker / test IP is provided, use it (allows testing rate limiting specifically)
    // - If RATE_LIMIT_STRICT is true, track on 127.0.0.1
    // - Otherwise, generate a unique per-request tracker so functional tests aren't blocked by IP limits
    if (process.env.NODE_ENV === 'test') {
      const testTracker =
        req.headers?.['x-test-ip'] || req.headers?.['x-test-tracker'];
      if (testTracker) {
        return String(testTracker).split(',')[0].trim();
      }
      if (process.env.RATE_LIMIT_STRICT === 'true') {
        return '127.0.0.1';
      }
      return `test-${Date.now()}-${Math.random()}`;
    }

    // Deliberate client IP resolution
    const rawIp =
      req.ip ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      '127.0.0.1';

    // Normalize IPv6-mapped IPv4 addresses (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
    const normalizedIp = String(rawIp).replace(/^::ffff:/, '').trim();

    return normalizedIp || '127.0.0.1';
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res, req } = this.getRequestResponse(context);
    const retryAfter =
      throttlerLimitDetail.timeToBlockExpire > 0
        ? throttlerLimitDetail.timeToBlockExpire
        : Math.max(1, Math.ceil(throttlerLimitDetail.timeToExpire));

    if (res && typeof res.header === 'function') {
      res.header('Retry-After', String(retryAfter));
    }

    this.logger.warn(
      `Rate limit exceeded on [${req?.method}] ${req?.url} for tracker: ${throttlerLimitDetail.tracker}. Retry after: ${retryAfter}s`,
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
