import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiResponse,
  ApiPaginationMeta,
} from '../interfaces/api-response.interface';
import {
  BYPASS_TRANSFORM_METADATA,
  DEFAULT_SUCCESS_MESSAGE,
  RESPONSE_MESSAGE_METADATA,
} from '../constants';

interface MaybePaginatedResponse<T = unknown> {
  data: T;
  meta?: ApiPaginationMeta;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | unknown>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | unknown> {
    // 1. Check if handler or controller requests bypassing transformation
    const bypass = this.reflector.getAllAndOverride<boolean>(
      BYPASS_TRANSFORM_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (bypass) {
      return next.handle();
    }

    // 2. Read custom response message from decorator if set
    const customMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_METADATA,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((response) => {
        // 3. Do not alter streaming files, buffers, or undefined (e.g. 204 No Content)
        if (
          response instanceof StreamableFile ||
          Buffer.isBuffer(response) ||
          response === undefined
        ) {
          return response;
        }

        // 4. Avoid double-wrapping if the response is already in standard ApiResponse format
        if (
          response !== null &&
          typeof response === 'object' &&
          'success' in response &&
          typeof (response as Record<string, unknown>).success === 'boolean'
        ) {
          return response;
        }

        // 5. Check if controller returned structured { data, meta, message } pagination object
        if (
          response !== null &&
          typeof response === 'object' &&
          'data' in response &&
          'meta' in response
        ) {
          const paginated = response as MaybePaginatedResponse<T>;
          return {
            success: true,
            message:
              paginated.message || customMessage || DEFAULT_SUCCESS_MESSAGE,
            data: paginated.data,
            meta: paginated.meta ?? null,
          };
        }

        // 6. Standard response envelope
        return {
          success: true,
          message: customMessage || DEFAULT_SUCCESS_MESSAGE,
          data: response ?? {},
          meta: null,
        };
      }),
    );
  }
}

