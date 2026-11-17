import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);
  private readonly trustedOrigins: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const configuredFrontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:3000';
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    const origins = [configuredFrontendUrl];

    if (!isProduction) {
      // In development and test environments, allow common local origins
      origins.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:4000',
        'http://127.0.0.1:4000',
      );
    }

    this.trustedOrigins = new Set(
      origins.map((origin) => this.normalizeOrigin(origin)),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const originHeader = request.headers['origin'];
    const refererHeader = request.headers['referer'];

    // 1. Check Origin header first (standard in CORS and state-changing browser requests)
    if (originHeader) {
      const normalized = this.normalizeOrigin(originHeader as string);
      if (!this.trustedOrigins.has(normalized)) {
        this.logger.warn(`Rejected untrusted origin: ${originHeader}`);
        throw new ForbiddenException('Untrusted request origin');
      }
      return true;
    }

    // 2. If Origin is absent, check Referer header
    if (refererHeader) {
      try {
        const parsedUrl = new URL(refererHeader as string);
        const normalized = this.normalizeOrigin(parsedUrl.origin);
        if (!this.trustedOrigins.has(normalized)) {
          this.logger.warn(`Rejected untrusted referer: ${refererHeader}`);
          throw new ForbiddenException('Untrusted request origin');
        }
        return true;
      } catch {
        this.logger.warn(`Rejected malformed referer: ${refererHeader}`);
        throw new ForbiddenException('Untrusted request origin');
      }
    }

    // 3. Neither Origin nor Referer is present.
    // Allow non-browser / server-to-server / automated test requests.
    return true;
  }

  private normalizeOrigin(url: string): string {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}
