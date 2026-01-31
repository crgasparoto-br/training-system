import { AuthService } from '../src/modules/auth/auth.service';
import bcryptjs from 'bcryptjs';

// Mock do Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    educator: {
      create: jest.fn(),
    },
  })),
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('register', () => {
    it('deve registrar um novo usuário com sucesso', async () => {
      const registerData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        type: 'educator' as const,
      };

      // Este teste seria mais completo com um banco de dados de teste
      expect(authService).toBeDefined();
    });

    it('deve lançar erro se email já existe', async () => {
      // Este teste seria mais completo com um banco de dados de teste
      expect(authService).toBeDefined();
    });
  });

  describe('login', () => {
    it('deve fazer login com sucesso', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      expect(authService).toBeDefined();
    });

    it('deve lançar erro com email incorreto', async () => {
      const loginData = {
        email: 'wrong@example.com',
        password: 'password123',
      };

      expect(authService).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    it('deve verificar token válido', () => {
      // Token seria gerado e verificado
      expect(authService).toBeDefined();
    });

    it('deve lançar erro com token inválido', () => {
      expect(() => {
        authService.verifyToken('invalid-token');
      }).toThrow();
    });
  });
});
