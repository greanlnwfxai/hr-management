import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock };

  const mockLoginResult = {
    accessToken: 'mock.jwt.token',
    user: { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' },
  };

  beforeEach(async () => {
    authService = { login: jest.fn().mockResolvedValue(mockLoginResult) };

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
    it('returns the user attached by the JWT guard', () => {
      const user = { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' } as Express.User;

      const result = controller.me(user);

      expect(result).toBe(user);
    });
  });
});
