import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim();
}

export interface CreateProfessorDTO {
  contractId: string;
  name: string;
  email: string;
  password: string;
}

export interface UpdateProfessorDTO {
  name?: string;
  email?: string;
  password?: string;
}

export const professorService = {
  /**
   * Criar professor vinculado ao contrato (somente academia)
   */
  async create(data: CreateProfessorDTO) {
    const normalizedEmail = normalizeEmail(data.email);
    const normalizedName = normalizeName(data.name);

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
    });

    if (!contract) {
      throw new Error('Contrato nÃ£o encontrado');
    }

    if (contract.type !== 'academy') {
      throw new Error('Contrato personal nÃ£o permite cadastrar professores');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new Error('Email jÃ¡ estÃ¡ registrado');
    }

    const passwordHash = await bcryptjs.hash(data.password, 10);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          type: 'professor',
          profile: {
            create: {
              name: normalizedName,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      return tx.professor.create({
        data: {
          userId: user.id,
          contractId: contract.id,
          role: 'professor',
        },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          contract: true,
        },
      });
    });
  },

  /**
   * Listar professores do contrato
   */
  async listByContract(contractId: string) {
    return prisma.professor.findMany({
      where: { contractId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        contract: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  /**
   * Desativar professor
   */
  async deactivate(contractId: string, professorId: string) {
    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
    });

    if (!professor) {
      throw new Error('Professor nÃ£o encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('NÃ£o Ã© possÃ­vel desativar o professor master');
    }

    return prisma.user.update({
      where: { id: professor.userId },
      data: { isActive: false },
    });
  },

  /**
   * Reset rÃ¡pido de senha do professor
   */
  async resetPassword(contractId: string, professorId: string) {
    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: { user: true },
    });

    if (!professor?.user) {
      throw new Error('Professor nÃ£o encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('NÃ£o Ã© possÃ­vel resetar a senha do professor master');
    }

    const tempPassword = `temp-${Date.now().toString().slice(-6)}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: professor.userId },
      data: { passwordHash },
    });

    return tempPassword;
  },

  /**
   * Atualizar professor do contrato
   */
  async update(contractId: string, professorId: string, data: UpdateProfessorDTO) {
    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
      include: {
        user: true,
      },
    });

    if (!professor) {
      throw new Error('Professor nÃ£o encontrado');
    }

    const normalizedEmail =
      typeof data.email === 'string' && data.email.trim().length > 0
        ? normalizeEmail(data.email)
        : undefined;

    const normalizedName =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? normalizeName(data.name)
        : undefined;

    if (normalizedEmail && normalizedEmail !== professor.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser && existingUser.id !== professor.user.id) {
        throw new Error('Email jÃ¡ estÃ¡ registrado');
      }
    }

    const updateUserData: any = {};
    const updateProfileData: any = {};

    if (normalizedEmail) {
      updateUserData.email = normalizedEmail;
    }

    if (typeof data.password === 'string' && data.password.trim().length > 0) {
      updateUserData.passwordHash = await bcryptjs.hash(data.password, 10);
    }

    if (normalizedName) {
      updateProfileData.name = normalizedName;
    }

    return prisma.$transaction(async (tx) => {
      if (Object.keys(updateUserData).length > 0) {
        await tx.user.update({
          where: { id: professor.userId },
          data: updateUserData,
        });
      }

      if (Object.keys(updateProfileData).length > 0) {
        await tx.profile.update({
          where: { userId: professor.userId },
          data: updateProfileData,
        });
      }

      return tx.professor.findUnique({
        where: { id: professorId },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          contract: true,
        },
      });
    });
  },
};

