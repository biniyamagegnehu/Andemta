import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
    login: jest.Mock;
  };
  let emailVerificationMock: {
    verifyEmail: jest.Mock;
    resendVerification: jest.Mock;
  };

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
    };

    emailVerificationMock = {
      verifyEmail: jest.fn(),
      resendVerification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
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
    it('should call authService.login and return token response', async () => {
      const dto: LoginDto = {
        email: 'researcher@andemta.et',
        password: 'ValidPassword123!',
      };

      const expectedResponse: LoginResponseDto = {
        accessToken: 'signed-access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'user-uuid-1',
          email: 'researcher@andemta.et',
          emailVerifiedAt: new Date('2026-11-14T10:00:00.000Z'),
        },
      };

      authServiceMock.login.mockResolvedValue(expectedResponse);

      const result = await controller.login(dto);

      expect(authServiceMock.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResponse);
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
});
