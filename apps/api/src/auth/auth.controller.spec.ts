import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    getMe: jest.Mock;
    changePassword: jest.Mock;
  };

  const mockLoginResult = {
    accessToken: 'mock.jwt.token',
    user: { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' },
  };

  const mockMeResult = {
    id: 'user-uuid-1',
    email: 'admin@hr.local',
    username: 'admin',
    role: 'SUPER_ADMIN',
    mustChangePassword: false,
    employeeId: null,
    employee: null,
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockResolvedValue(mockLoginResult),
      getMe: jest.fn().mockResolvedValue(mockMeResult),
      changePassword: jest.fn().mockResolvedValue({ success: true, mustChangePassword: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /auth/login', () => {
    it('delegates to auth service and returns result', async () => {
      const dto = { email: 'admin@hr.local', password: 'admin1234' };

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockLoginResult);
    });

    it('returns an object with accessToken and user', async () => {
      const result = await controller.login({ email: 'admin@hr.local', password: 'admin1234' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
    });
  });

  describe('GET /auth/me', () => {
    it('delegates to authService.getMe with user id', async () => {
      const user = { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' } as Express.User;

      const result = await controller.me(user);

      expect(authService.getMe).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockMeResult);
    });

    it('returns profile with mustChangePassword and employee fields', async () => {
      const user = { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' } as Express.User;

      const result = await controller.me(user);

      expect(result).toHaveProperty('mustChangePassword');
      expect(result).toHaveProperty('employeeId');
      expect(result).toHaveProperty('employee');
    });
  });

  describe('POST /auth/change-password', () => {
    it('delegates to authService.changePassword with user id and dto', async () => {
      const user = { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' } as Express.User;
      const dto = {
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
        confirmPassword: 'NewPass1!',
      };

      const result = await controller.changePassword(user, dto as any);

      expect(authService.changePassword).toHaveBeenCalledWith('user-uuid-1', dto);
      expect(result).toEqual({ success: true, mustChangePassword: false });
    });
  });
});
