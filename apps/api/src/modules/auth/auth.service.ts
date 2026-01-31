import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import type { JwtPayload, LoginRequest, RegisterRequest, AuthResponse } from '@corrida/types';

const prisma = new PrismaClient();

export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  private readonly jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

  /**
   * Registrar novo usuário
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('Email já está registrado');
    }

    // Hash da senha
    const passwordHash = await bcryptjs.hash(data.password, 10);

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        type: data.type,
        profile: {
          create: {
            name: data.name,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    // Criar perfil de educador ou aluno
    if (data.type === 'educator') {
      await prisma.educator.create({
        data: {
          userId: user.id,
        },
      });
    } else {
      // Aluno será criado quando associado a um educador
    }

    // Gerar token
    const token = this.generateToken(user.id, user.email, user.type);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || '',
        type: user.type,
      },
    };
  }

  /**
   * Fazer login
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new Error('Email ou senha incorretos');
    }

    // Verificar senha
    const passwordMatch = await bcryptjs.compare(data.password, user.passwordHash);

    if (!passwordMatch) {
      throw new Error('Email ou senha incorretos');
    }

    // Gerar token
    const token = this.generateToken(user.id, user.email, user.type);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || '',
        type: user.type,
      },
    };
  }

  /**
   * Verificar token
   */
  verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      return decoded;
    } catch (error) {
      throw new Error('Token inválido ou expirado');
    }
  }

  /**
   * Gerar novo token
   */
  private generateToken(userId: string, email: string, type: string): string {
    const payload: JwtPayload = {
      userId,
      email,
      type: type as 'educator' | 'student',
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  /**
   * Validar email
   */
  async validateEmail(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email },
    });
    return !user;
  }

  /**
   * Obter usuário por ID
   */
  async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        educator: true,
        athlete: true,
      },
    });
  }
}

export const authService = new AuthService();
