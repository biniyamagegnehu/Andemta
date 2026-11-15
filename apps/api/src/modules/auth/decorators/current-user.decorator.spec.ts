import { ExecutionContext } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

describe('CurrentUser decorator', () => {
  function getParamDecoratorFactory(
    decorator: () => ParameterDecorator,
  ): (data: unknown, ctx: ExecutionContext) => unknown {
    class TestClass {
      testMethod(@decorator() _user: unknown) {}
    }
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestClass,
      'testMethod',
    );
    const key = Object.keys(metadata)[0];
    return metadata[key].factory;
  }

  const mockUser: AuthenticatedUser = {
    id: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
    email: 'researcher@andemta.et',
    emailVerifiedAt: new Date('2026-11-14T10:00:00.000Z'),
  };

  it('should return entire authenticated user object when no property is specified', () => {
    const factory = getParamDecoratorFactory(CurrentUser);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: mockUser }),
      }),
    } as unknown as ExecutionContext;

    const result = factory(undefined, mockContext);
    expect(result).toEqual(mockUser);
  });

  it('should return specific property when property key is specified', () => {
    const factory = getParamDecoratorFactory(CurrentUser);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: mockUser }),
      }),
    } as unknown as ExecutionContext;

    const idResult = factory('id', mockContext);
    expect(idResult).toBe('c1f7a049-74d1-4db8-b570-5b5832a52df4');

    const emailResult = factory('email', mockContext);
    expect(emailResult).toBe('researcher@andemta.et');
  });

  it('should return undefined if request has no authenticated user', () => {
    const factory = getParamDecoratorFactory(CurrentUser);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
    } as unknown as ExecutionContext;

    const result = factory(undefined, mockContext);
    expect(result).toBeUndefined();
  });
});
