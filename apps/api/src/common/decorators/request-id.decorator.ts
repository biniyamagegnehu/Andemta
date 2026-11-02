import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '../constants';

/**
 * Parameter decorator to extract the active request ID in controller handlers.
 * E.g., @Get() handler(@RequestId() requestId: string)
 */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return (
      (request.id as string) ||
      (request.headers[REQUEST_ID_HEADER] as string) ||
      'unknown'
    );
  },
);

