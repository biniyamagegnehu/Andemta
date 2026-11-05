import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
  };

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
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
});

