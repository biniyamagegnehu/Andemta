import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { ApiResponse } from '../interfaces/api-response.interface';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new TransformInterceptor(reflector);
  });

  it('should wrap standard response into standard success envelope', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of({ test: 'value' }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (result) => {
        const wrapped = result as ApiResponse<{ test: string }>;
        expect(wrapped.success).toBe(true);
        expect(wrapped.message).toBe('Request completed successfully');
        expect(wrapped.data).toEqual({ test: 'value' });
        expect(wrapped.meta).toBeNull();
        done();
      },
      error: done,
    });
  });

  it('should honor custom response message decorator', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((metadataKey) => {
      if (metadataKey === 'response_message_metadata') {
        return 'Custom created message';
      }
      return undefined;
    });

    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of({ id: 123 }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (result) => {
        const wrapped = result as ApiResponse<{ id: number }>;
        expect(wrapped.success).toBe(true);
        expect(wrapped.message).toBe('Custom created message');
        expect(wrapped.data).toEqual({ id: 123 });
        done();
      },
      error: done,
    });
  });

  it('should not double-wrap an already wrapped response', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const alreadyWrapped = {
      success: true,
      message: 'Already formatted',
      data: { key: 'val' },
      meta: null,
    };

    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of(alreadyWrapped),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (result) => {
        expect(result).toBe(alreadyWrapped);
        done();
      },
      error: done,
    });
  });
});

