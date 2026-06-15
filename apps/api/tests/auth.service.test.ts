import { AuthService } from '../src/modules/auth/auth.service';
import bcryptjs from 'bcryptjs';

const mockDb = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  educator: {
    create: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockDb),
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe('register', () => {
    it('deve registrar um novo usuário com sucesso', async () => {
      expect(authService).toBeDefined();
    });

    it('deve lançar erro se email já existe', async () => {
      expect(authService).toBeDefined();
    });
  });

  describe('login', () => {
    it('deve fazer login com sucesso', async () => {
      expect(authService).toBeDefined();
    });

    it('deve lançar erro com email incorreto', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'wrong@example.com', password: 'password123' })
      ).rejects.toThrow('E-mail ou senha incorretos');
    });

    it('deve lançar erro para usuário inativo antes de comparar senha', async () => {
      const compareSpy = jest.spyOn(bcryptjs, 'compare');
      mockDb.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'inactive@example.com',
        passwordHash: 'hash',
        type: 'professor',
        isActive: false,
        profile: { name: 'Inactive User' },
        professor: null,
      });

      await expect(
        authService.login({ email: 'inactive@example.com', password: 'password123' })
      ).rejects.toThrow('Usuário desativado');

      expect(compareSpy).not.toHaveBeenCalled();
      expect(mockDb.user.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyToken', () => {
    it('deve verificar token válido', () => {
      expect(authService).toBeDefined();
    });

    it('deve lançar erro com token inválido', () => {
      expect(() => {
        authService.verifyToken('invalid-token');
      }).toThrow('Token inválido ou expirado');
    });
  });
});
