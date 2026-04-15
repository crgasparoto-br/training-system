import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import type { JwtPayload, LoginRequest, RegisterRequest, AuthResponse } from '@corrida/types';
import type { SignOptions } from 'jsonwebtoken';
import { ensureDefaultAssessmentTypes } from '../assessments/assessment-type.service';
import { ensureDefaultSubjectiveScales } from '../assessments/subjective-scale.service';

const prisma = new PrismaClient();

export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  private readonly jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

  private normalizeDocument(document: string): string {
    return document.replace(/\D/g, '');
  }

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

    if (data.type !== 'educator') {
      throw new Error('Apenas educadores podem se cadastrar diretamente');
    }

    const document = this.normalizeDocument(data.document);
    const expectedLength = data.contractType === 'academy' ? 14 : 11;

    if (document.length !== expectedLength) {
      throw new Error(
        data.contractType === 'academy'
          ? 'CNPJ inválido'
          : 'CPF inválido'
      );
    }

    const existingContract = await prisma.contract.findUnique({
      where: { document },
    });

    if (existingContract) {
      throw new Error('Documento já está registrado');
    }

    // Hash da senha
    const passwordHash = await bcryptjs.hash(data.password, 10);

    // Criar contrato, usuário e educador master
    const { user, educator } = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          type: data.contractType,
          document,
        },
      });

      const createdUser = await tx.user.create({
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

      const createdEducator = await tx.educator.create({
        data: {
          userId: createdUser.id,
          contractId: contract.id,
          role: 'master',
        },
        include: {
          contract: true,
        },
      });

      await ensureDefaultAssessmentTypes(tx, contract.id);
      await ensureDefaultSubjectiveScales(tx, contract.id);

      return {
        user: createdUser,
        educator: createdEducator,
      };
    });

    // Gerar token
    const token = this.generateToken(user.id, user.email, user.type);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || '',
        type: user.type,
        educator: educator
          ? {
              id: educator.id,
              role: educator.role,
              contract: {
                id: educator.contract.id,
                type: educator.contract.type,
                document: educator.contract.document,
                name: educator.contract.name,
              },
            }
          : null,
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
        educator: {
          include: {
            contract: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('Email ou senha incorretos');
    }
    if (!user.isActive) {
      throw new Error('Usuário desativado');
    }

    // Verificar senha
    const passwordMatch = await bcryptjs.compare(data.password, user.passwordHash);

    if (!passwordMatch) {
      throw new Error('Email ou senha incorretos');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Gerar token
    const token = this.generateToken(user.id, user.email, user.type);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || '',
        type: user.type,
        educator: user.educator
          ? {
              id: user.educator.id,
              role: user.educator.role,
              contract: {
                id: user.educator.contract.id,
                type: user.educator.contract.type,
                document: user.educator.contract.document,
                name: user.educator.contract.name,
              },
            }
          : null,
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
        educator: {
          include: {
            contract: true,
          },
        },
        athlete: true,
      },
    });
  }

  async getEducatorByUserId(userId: string) {
    return prisma.educator.findUnique({
      where: { userId },
      include: {
        contract: true,
      },
    });
  }
}

export const authService = new AuthService();
