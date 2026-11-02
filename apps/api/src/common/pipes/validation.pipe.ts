import {
  ValidationPipe as NestValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';
import { ApiErrorDetail } from '../interfaces/api-response.interface';

/**
 * Recursively maps class-validator ValidationError objects into clean ApiErrorDetail entries.
 */
export function formatValidationErrors(
  errors: ValidationError[],
  parentField = '',
): ApiErrorDetail[] {
  const result: ApiErrorDetail[] = [];

  for (const error of errors) {
    const fieldPath = parentField
      ? `${parentField}.${error.property}`
      : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({
          field: fieldPath,
          message: message,
        });
      }
    }

    if (error.children && error.children.length > 0) {
      result.push(...formatValidationErrors(error.children, fieldPath));
    }
  }

  return result;
}

/**
 * Factory for creating the application-wide ValidationPipe with strict rules
 * and standardized error formatting.
 */
export function createGlobalValidationPipe(): NestValidationPipe {
  return new NestValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (validationErrors: ValidationError[] = []) => {
      const formattedErrors = formatValidationErrors(validationErrors);
      return new BadRequestException({
        message: 'Validation failed',
        errors: formattedErrors,
      });
    },
  });
}

