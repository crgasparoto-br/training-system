import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

export interface CreateEducatorDTO {
  contractId: string;
  name: string;
  email: string;
  password: string;
}

export interface UpdateEducatorDTO {
  name?: string;
  email?: string;
  password?: string;
}

export const educatorService = {
  /**
   * Criar educador vinculado ao contrato (somente academia)
   */
  async create(data: CreateEducatorDTO) {
    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
    });

    if (!contract) {
      throw new Error('Contrato não encontrado');
    }

    if (contract.type !== 'academy') {
      throw new Error('Contrato personal não permite cadastrar educadores');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('Email já está registrado');
    }

    const passwordHash = await bcryptjs.hash(data.password, 10);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          type: 'educator',
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

      return tx.educator.create({
        data: {
          userId: user.id,
          contractId: contract.id,
          role: 'educator',
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
   * Listar educadores do contrato
   */
  async listByContract(contractId: string) {
    return prisma.educator.findMany({
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
   * Desativar educador
   */
  async deactivate(contractId: string, educatorId: string) {
    const educator = await prisma.educator.findFirst({
      where: { id: educatorId, contractId },
    });

    if (!educator) {
      throw new Error('Educador não encontrado');
    }
    if (educator.role === 'master') {
      throw new Error('Não é possível desativar o educador master');
    }

    return prisma.user.update({
      where: { id: educator.userId },
      data: { isActive: false },
    });
  },

  /**
   * Reset rápido de senha do educador
   */
  async resetPassword(contractId: string, educatorId: string) {
    const educator = await prisma.educator.findFirst({
      where: { id: educatorId, contractId },
      include: { user: true },
    });

    if (!educator?.user) {
      throw new Error('Educador não encontrado');
    }
    if (educator.role === 'master') {
      throw new Error('Não é possível resetar a senha do educador master');
    }

    const tempPassword = `temp-${Date.now().toString().slice(-6)}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: educator.userId },
      data: { passwordHash },
    });

    return tempPassword;
  },

  /**
   * Atualizar educador do contrato
   */
  async update(contractId: string, educatorId: string, data: UpdateEducatorDTO) {
    const educator = await prisma.educator.findFirst({
      where: { id: educatorId, contractId },
      include: {
        user: true,
      },
    });

    if (!educator) {
      throw new Error('Educador não encontrado');
    }

    if (data.email && data.email !== educator.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser && existingUser.id !== educator.user.id) {
        throw new Error('Email já está registrado');
      }
    }

    const updateUserData: any = {};
    const updateProfileData: any = {};

    if (typeof data.email === 'string' && data.email.trim().length > 0) {
      updateUserData.email = data.email.trim();
    }

    if (typeof data.password === 'string' && data.password.trim().length > 0) {
      updateUserData.passwordHash = await bcryptjs.hash(data.password, 10);
    }

    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      updateProfileData.name = data.name.trim();
    }

    return prisma.$transaction(async (tx) => {
      if (Object.keys(updateUserData).length > 0) {
        await tx.user.update({
          where: { id: educator.userId },
          data: updateUserData,
        });
      }

      if (Object.keys(updateProfileData).length > 0) {
        await tx.profile.update({
          where: { userId: educator.userId },
          data: updateProfileData,
        });
      }

      return tx.educator.findUnique({
        where: { id: educatorId },
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
