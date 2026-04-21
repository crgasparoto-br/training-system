import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import type { JwtPayload, LoginRequest, RegisterRequest, AuthResponse } from '@corrida/types';
import type { SignOptions } from 'jsonwebtoken';
import { ensureDefaultAssessmentTypesForContract } from '../assessments/assessment-type.service';
import { ensureDefaultSubjectiveScalesForContract } from '../assessments/subjective-scale.service';
import { getDefaultCollaboratorFunctionByCode } from '../collaborator-functions/index.js';

const prisma = new PrismaClient();

export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  private readonly jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

  private normalizeDocument(document: string): string {
    return document.replace(/\D/g, '');
  }

  private serializeCollaboratorFunction(collaboratorFunction: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    isSystem: boolean;
  }) {
    return {
      id: collaboratorFunction.id,
      name: collaboratorFunction.name,
      code: collaboratorFunction.code,
      isActive: collaboratorFunction.isActive,
      isSystem: collaboratorFunction.isSystem,
    };
  }

  private serializeResponsibleManager(responsibleManager?: {
    id: string;
    role: 'master' | 'professor';
    user?: {
      id: string;
      email: string;
      isActive: boolean;
      profile?: {
        name: string;
        phone?: string | null;
      } | null;
    } | null;
    collaboratorFunction: {
      id: string;
      name: string;
      code: string;
      isActive: boolean;
      isSystem: boolean;
    };
  } | null) {
    if (!responsibleManager?.user) {
      return null;
    }

    return {
      id: responsibleManager.id,
      role: responsibleManager.role,
      user: {
        id: responsibleManager.user.id,
        email: responsibleManager.user.email,
        isActive: responsibleManager.user.isActive,
        profile: {
          name: responsibleManager.user.profile?.name || '',
          phone: responsibleManager.user.profile?.phone ?? null,
        },
      },
      collaboratorFunction: this.serializeCollaboratorFunction(
        responsibleManager.collaboratorFunction
      ),
    };
  }

  /**
   * Registrar novo usuÃ¡rio
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('E-mail já está registrado');
    }

    if (data.type !== 'professor') {
      throw new Error('Apenas professores podem se cadastrar diretamente');
    }

    const document = this.normalizeDocument(data.document);
    const expectedLength = data.contractType === 'academy' ? 14 : 11;

    if (document.length !== expectedLength) {
      throw new Error(data.contractType === 'academy' ? 'CNPJ inválido' : 'CPF inválido');
    }

    const existingContract = await prisma.contract.findUnique({
      where: { document },
    });

    if (existingContract) {
      throw new Error('Documento já está registrado');
    }

    const passwordHash = await bcryptjs.hash(data.password, 10);

    const { user, professor, contractId } = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          type: data.contractType,
          document,
        },
      });

      const managerFunction = await getDefaultCollaboratorFunctionByCode(contract.id, 'manager', tx);

      if (!managerFunction) {
        throw new Error('Não foi possível preparar as funções padrão do contrato');
      }

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

      const createdProfessor = await tx.professor.create({
        data: {
          userId: createdUser.id,
          contractId: contract.id,
          role: 'master',
          collaboratorFunctionId: managerFunction.id,
        },
        include: {
          collaboratorFunction: true,
          contract: true,
          responsibleManager: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
              collaboratorFunction: true,
            },
          },
        },
      });

      return {
        user: createdUser,
        professor: createdProfessor,
        contractId: contract.id,
      };
    });

    await ensureDefaultSubjectiveScalesForContract(contractId);

    // Gerar token
    const token = this.generateToken(user.id, user.email, user.type);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name || '',
        type: user.type,
        professor: professor
          ? {
              id: professor.id,
              role: professor.role,
              collaboratorFunction: this.serializeCollaboratorFunction(professor.collaboratorFunction),
              responsibleManager: this.serializeResponsibleManager(
                professor.responsibleManager
              ),
              contract: {
                id: professor.contract.id,
                type: professor.contract.type,
                document: professor.contract.document,
                name: professor.contract.name,
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
    // Buscar usuÃ¡rio
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        profile: true,
        professor: {
          include: {
            collaboratorFunction: true,
            contract: true,
            responsibleManager: {
              include: {
                user: {
                  include: {
                    profile: true,
                  },
                },
                collaboratorFunction: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error('E-mail ou senha incorretos');
    }
    if (!user.isActive) {
      throw new Error('Usuário desativado');
    }

    // Verificar senha
    const passwordMatch = await bcryptjs.compare(data.password, user.passwordHash);

    if (!passwordMatch) {
      throw new Error('E-mail ou senha incorretos');
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
        professor: user.professor
          ? {
              id: user.professor.id,
              role: user.professor.role,
              collaboratorFunction: this.serializeCollaboratorFunction(user.professor.collaboratorFunction),
              responsibleManager: this.serializeResponsibleManager(
                user.professor.responsibleManager
              ),
              contract: {
                id: user.professor.contract.id,
                type: user.professor.contract.type,
                document: user.professor.contract.document,
                name: user.professor.contract.name,
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
      throw new Error('Token invÃ¡lido ou expirado');
    }
  }

  /**
   * Gerar novo token
   */
  private generateToken(userId: string, email: string, type: string): string {
    const payload: JwtPayload = {
      userId,
      email,
      type: type as 'professor' | 'aluno',
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
   * Obter usuÃ¡rio por ID
   */
  async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        professor: {
          include: {
            collaboratorFunction: true,
            contract: true,
            responsibleManager: {
              include: {
                user: {
                  include: {
                    profile: true,
                  },
                },
                collaboratorFunction: true,
              },
            },
          },
        },
        aluno: true,
      },
    });
  }

  async getProfessorByUserId(userId: string) {
    return prisma.professor.findUnique({
      where: { userId },
      include: {
        contract: true,
        collaboratorFunction: true,
        responsibleManager: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
            collaboratorFunction: true,
          },
        },
      },
    });
  }
}

export const authService = new AuthService();

