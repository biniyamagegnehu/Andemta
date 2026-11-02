import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiErrorResponse,
  ApiErrorDetail,
} from '../interfaces/api-response.interface';
import { REQUEST_ID_HEADER } from '../constants';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request as Request & { id?: string }).id ||
      (request.headers[REQUEST_ID_HEADER] as string) ||
      'unknown';

    // Ensure the response carries the Request ID header
    response.setHeader('X-Request-ID', requestId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal error occurred';
    let errors: ApiErrorDetail[] = [];

    const isProduction = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as Record<string, unknown>;

        if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (Array.isArray(resObj.message)) {
          message = 'Validation failed';
          errors = resObj.message.map((msg) => ({
            message: String(msg),
          }));
        }

        // Extract detailed errors if supplied by custom exception or validation pipe
        if (Array.isArray(resObj.errors)) {
          errors = resObj.errors as ApiErrorDetail[];
        }
      }
    } else if (exception instanceof Error) {
      // In development / test, log the stack trace and preserve the message
      if (!isProduction) {
        message = exception.message;
      }
    }

    // Security guard: in production, never leak 500 internals to client
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && isProduction) {
      message = 'Internal server error';
      errors = [];
    }

    // Log the error with request ID correlation
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${
          exception instanceof Error ? exception.stack : JSON.stringify(exception)
        }`,
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} - ${status} - ${message}`,
      );
    }

    const errorBody: ApiErrorResponse = {
      success: false,
      message,
      data: null,
      errors: errors.length > 0 ? errors : undefined as unknown as ApiErrorDetail[],
    };

    // Ensure errors property is array (or empty array if none)
    if (!errorBody.errors) {
      errorBody.errors = [];
    }

    response.status(status).json(errorBody);
  }
}

