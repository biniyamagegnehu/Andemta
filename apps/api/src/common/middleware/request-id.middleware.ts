import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { REQUEST_ID_HEADER } from '../constants';

/**
 * Validates whether an incoming Request ID meets safety requirements.
 * Policy:
 * - Must be an alphanumeric string with optional hyphens or underscores
 * - Length between 8 and 64 characters
 * Prevents header injection or malformed tracking strings.
 */
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9\-_]{8,64}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingHeader = req.headers[REQUEST_ID_HEADER];
    let requestId: string;

    if (
      typeof incomingHeader === 'string' &&
      SAFE_REQUEST_ID_REGEX.test(incomingHeader.trim())
    ) {
      requestId = incomingHeader.trim();
    } else {
      requestId = randomUUID();
    }

    // Attach request ID to express request object and request headers
    (req as Request & { id: string }).id = requestId;
    req.headers[REQUEST_ID_HEADER] = requestId;

    // Set standard response header
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}

