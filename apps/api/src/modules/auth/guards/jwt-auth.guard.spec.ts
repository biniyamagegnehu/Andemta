import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  const validUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'user@andemta.et',
    emailVerifiedAt: new Date(),
  };

  it('should return user when authentication succeeds with valid credentials', () => {
    const result = guard.handleRequest(null, validUser, null, mockContext);
    expect(result).toEqual(validUser);
  });

  it('should re-throw err when passport passes an explicit error', () => {
    const customError = new UnauthorizedException('Custom auth error');
    expect(() =>
      guard.handleRequest(customError, false, null, mockContext),
    ).toThrow(customError);
  });

  it('should throw clear exception when token is expired', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        { name: 'TokenExpiredError', message: 'jwt expired' },
        mockContext,
      ),
    ).toThrow(new UnauthorizedException('Access token has expired'));
  });

  it('should throw clear exception when token signature or payload is invalid', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        { name: 'JsonWebTokenError', message: 'invalid signature' },
        mockContext,
      ),
    ).toThrow(new UnauthorizedException('Invalid access token'));
  });

  it('should throw clear exception when no auth token is provided', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        { message: 'No auth token' },
        mockContext,
      ),
    ).toThrow(new UnauthorizedException('Missing Bearer authentication token'));
  });

  it('should throw generic unauthorized exception when user is false without specific info', () => {
    expect(() =>
      guard.handleRequest(null, false, null, mockContext),
    ).toThrow(new UnauthorizedException('Unauthorized access'));
  });
});
