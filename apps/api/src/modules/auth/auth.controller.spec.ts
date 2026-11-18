import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
    login: jest.Mock;
    refreshSession: jest.Mock;
    logout: jest.Mock;
    logoutAll: jest.Mock;
  };
  let emailVerificationMock: {
    verifyEmail: jest.Mock;
    resendVerification: jest.Mock;
  };
  let passwordResetMock: {
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };

  const makeMockRequest = (overrides: Record<string, unknown> = {}) => ({
    headers: { 'user-agent': 'jest-test-agent' },
    ip: '127.0.0.1',
    cookies: {},
    ...overrides,
  });

  const makeMockResponse = () => ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  });

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
      refreshSession: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
    };

    emailVerificationMock = {
      verifyEmail: jest.fn(),
      resendVerification: jest.fn(),
    };

    passwordResetMock = {
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'auth.refreshCookieName') return 'andemta_refresh';
        if (key === 'auth.refreshTokenTtlDays') return 30;
        if (key === 'auth.cookieSecure') return false;
        if (key === 'auth.cookieSameSite') return 'lax';
        if (key === 'auth.refreshCookiePath') return '/api/v1/auth';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: EmailVerificationService, useValue: emailVerificationMock },
        { provide: PasswordResetService, useValue: passwordResetMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call authService.register and return safe response', async () => {
      const dto: RegisterDto = {
        email: 'researcher@andemta.et',
        password: 'ValidPassword123!',
      };

      const expectedResponse: RegisterResponseDto = {
        id: 'user-uuid-1234',
        email: 'researcher@andemta.et',
        emailVerifiedAt: null,
        createdAt: new Date('2026-11-05T20:00:00.000Z'),
      };

      authServiceMock.register.mockResolvedValue(expectedResponse);

      const result = await controller.register(dto);

      expect(authServiceMock.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('verifyEmail', () => {
    it('should call emailVerificationService.verifyEmail and return result', async () => {
      const dto: VerifyEmailDto = { token: 'sample-raw-token-123' };
      const expected = {
        email: 'researcher@andemta.et',
        emailVerifiedAt: new Date(),
      };

      emailVerificationMock.verifyEmail.mockResolvedValueOnce(expected);

      const result = await controller.verifyEmail(dto);

      expect(emailVerificationMock.verifyEmail).toHaveBeenCalledWith(dto.token);
      expect(result).toEqual(expected);
    });
  });

  describe('resendVerification', () => {
    it('should call emailVerificationService.resendVerification and return generic response', async () => {
      const dto: ResendVerificationDto = { email: 'researcher@andemta.et' };
      const expected = {
        message:
          'If an account requires email verification, a verification email will be sent.',
      };

      emailVerificationMock.resendVerification.mockResolvedValueOnce(expected);

      const result = await controller.resendVerification(dto);

      expect(emailVerificationMock.resendVerification).toHaveBeenCalledWith(
        dto.email,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'researcher@andemta.et',
      password: 'ValidPassword123!',
    };

    const serviceResult = {
      accessToken: 'signed-access-token',
      tokenType: 'Bearer' as const,
      expiresIn: 900,
      user: {
        id: 'user-uuid-1',
        email: 'researcher@andemta.et',
        emailVerifiedAt: new Date('2026-11-14T10:00:00.000Z'),
      },
      rawRefreshToken: 'raw-opaque-refresh-token',
    };

    it('should call authService.login with User-Agent and IP, set HttpOnly cookie, and return LoginResponseDto WITHOUT rawRefreshToken', async () => {
      authServiceMock.login.mockResolvedValue(serviceResult);
      const req = makeMockRequest();
      const res = makeMockResponse();

      const result = await controller.login(
        dto,
        req as never,
        res as never,
      );

      expect(authServiceMock.login).toHaveBeenCalledWith(
        dto,
        'jest-test-agent',
        '127.0.0.1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'andemta_refresh',
        'raw-opaque-refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      // rawRefreshToken must NOT appear in the JSON response body
      expect(
        (result as unknown as Record<string, unknown>).rawRefreshToken,
      ).toBeUndefined();
      expect(result.accessToken).toBe('signed-access-token');
    });
  });

  describe('refresh', () => {
    it('should read cookie, call authService.refreshSession, set new cookie, and return LoginResponseDto', async () => {
      const rotatedLoginResponse: LoginResponseDto = {
        accessToken: 'new-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'user-uuid-1',
          email: 'researcher@andemta.et',
          emailVerifiedAt: new Date(),
        },
      };

      authServiceMock.refreshSession.mockResolvedValue({
        loginResponse: rotatedLoginResponse,
        rawRefreshToken: 'new-raw-refresh-token',
      });

      const req = makeMockRequest({
        cookies: { andemta_refresh: 'old-raw-refresh-token' },
      });
      const res = makeMockResponse();

      const result = await controller.refresh(req as never, res as never);

      expect(authServiceMock.refreshSession).toHaveBeenCalledWith(
        'old-raw-refresh-token',
        'jest-test-agent',
        '127.0.0.1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'andemta_refresh',
        'new-raw-refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result.accessToken).toBe('new-access-token');
    });

    it('should clear cookie and throw UnauthorizedException when cookie is absent', async () => {
      const req = makeMockRequest({ cookies: {} });
      const res = makeMockResponse();

      await expect(controller.refresh(req as never, res as never)).rejects.toThrow(
        new UnauthorizedException('Refresh token is required'),
      );
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('should clear cookie and re-throw on refreshSession failure', async () => {
      authServiceMock.refreshSession.mockRejectedValue(
        new UnauthorizedException('Session has been revoked'),
      );

      const req = makeMockRequest({
        cookies: { andemta_refresh: 'revoked-token' },
      });
      const res = makeMockResponse();

      await expect(controller.refresh(req as never, res as never)).rejects.toThrow(
        'Session has been revoked',
      );
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should read cookie, revoke session, and clear cookie', async () => {
      authServiceMock.logout.mockResolvedValue(undefined);

      const req = makeMockRequest({
        cookies: { andemta_refresh: 'valid-refresh-token' },
      });
      const res = makeMockResponse();

      await controller.logout(req as never, res as never);

      expect(authServiceMock.logout).toHaveBeenCalledWith('valid-refresh-token');
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('should still clear cookie even if no refresh token cookie is present (idempotent)', async () => {
      const req = makeMockRequest({ cookies: {} });
      const res = makeMockResponse();

      await controller.logout(req as never, res as never);

      expect(authServiceMock.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should revoke all user sessions and clear cookie', async () => {
      authServiceMock.logoutAll.mockResolvedValue(undefined);
      const user: AuthenticatedUser = {
        id: 'user-uuid-1',
        email: 'researcher@andemta.et',
        emailVerifiedAt: new Date(),
      };
      const res = makeMockResponse();

      await controller.logoutAll(user, res as never);

      expect(authServiceMock.logoutAll).toHaveBeenCalledWith('user-uuid-1');
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return the authenticated user passed by CurrentUser decorator', async () => {
      const user: AuthenticatedUser = {
        id: 'user-uuid-1',
        email: 'researcher@andemta.et',
        emailVerifiedAt: new Date('2026-11-14T10:00:00.000Z'),
      };

      const result = await controller.getProfile(user);

      expect(result).toEqual(user);
    });
  });

  describe('forgotPassword', () => {
    it('should call passwordResetService.forgotPassword and return empty object for envelope wrapping', async () => {
      const dto: ForgotPasswordDto = { email: 'researcher@andemta.et' };
      passwordResetMock.forgotPassword.mockResolvedValueOnce(undefined);

      const result = await controller.forgotPassword(dto);

      expect(passwordResetMock.forgotPassword).toHaveBeenCalledWith(dto.email);
      expect(result).toEqual({});
    });
  });

  describe('resetPassword', () => {
    it('should call passwordResetService.resetPassword and return empty object for envelope wrapping', async () => {
      const dto: ResetPasswordDto = {
        token: 'sample-raw-reset-token',
        newPassword: 'NewSecurePassword123!',
      };
      passwordResetMock.resetPassword.mockResolvedValueOnce(undefined);

      const result = await controller.resetPassword(dto);

      expect(passwordResetMock.resetPassword).toHaveBeenCalledWith(
        dto.token,
        dto.newPassword,
      );
      expect(result).toEqual({});
    });
  });
});
