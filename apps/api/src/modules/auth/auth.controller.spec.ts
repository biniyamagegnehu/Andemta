import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
  };
  let emailVerificationMock: {
    verifyEmail: jest.Mock;
    resendVerification: jest.Mock;
  };

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
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
});


