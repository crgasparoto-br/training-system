import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { getCollaboratorFunctionForContract } from '../collaborator-functions/index.js';

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
  collaboratorFunctionId: string;
  responsibleManagerId?: string;
}

export interface UpdateProfessorDTO {
  name?: string;
  email?: string;
  password?: string;
  collaboratorFunctionId?: string;
  responsibleManagerId?: string;
}

function canLeadCollaborators(professor: {
  role: 'master' | 'professor';
  collaboratorFunction: { code: string };
}) {
  return professor.role === 'master' || professor.collaboratorFunction.code === 'manager';
}

function requiresResponsibleManager(collaboratorFunctionCode: string) {
  return collaboratorFunctionCode !== 'manager';
}

async function getResponsibleManagerForContract(
  contractId: string,
  responsibleManagerId: string
) {
  const responsibleManager = await prisma.professor.findFirst({
    where: {
      id: responsibleManagerId,
      contractId,
      user: {
        isActive: true,
      },
    },
    include: {
      user: {
        include: {
          profile: true,
        },
      },
      collaboratorFunction: true,
    },
  });

  if (!responsibleManager) {
    throw new Error('Gestor responsável não encontrado');
  }

  if (!canLeadCollaborators(responsibleManager)) {
    throw new Error('O colaborador selecionado não pode ser definido como gestor responsável');
  }

  return responsibleManager;
}

async function countManagedCollaborators(responsibleManagerId: string, excludeProfessorId?: string) {
  return prisma.professor.count({
    where: {
      responsibleManagerId,
      ...(excludeProfessorId ? { id: { not: excludeProfessorId } } : {}),
    },
  });
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
      throw new Error('Contrato não encontrado');
    }

    if (contract.type !== 'academy') {
      throw new Error('Contrato personal nÃ£o permite cadastrar professores');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new Error('E-mail já está registrado');
    }

    const passwordHash = await bcryptjs.hash(data.password, 10);
    const collaboratorFunction = await getCollaboratorFunctionForContract(
      contract.id,
      data.collaboratorFunctionId
    );
    const shouldRequireResponsibleManager = requiresResponsibleManager(
      collaboratorFunction.code
    );

    let responsibleManagerId: string | undefined;

    if (!collaboratorFunction.isActive) {
      throw new Error('A função selecionada está inativa');
    }

    if (shouldRequireResponsibleManager) {
      if (!data.responsibleManagerId) {
        throw new Error('Selecione um gestor responsável para este colaborador');
      }

      const responsibleManager = await getResponsibleManagerForContract(
        contract.id,
        data.responsibleManagerId
      );

      responsibleManagerId = responsibleManager.id;
    }

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
          collaboratorFunctionId: collaboratorFunction.id,
          responsibleManagerId,
        },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
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
          contract: true,
        },
      });
    });
  },

  /**
   * Listar professores do contrato
   */
  async listByContract(
    contractId: string,
    status: 'active' | 'inactive' | 'all' = 'all'
  ) {
    const where =
      status === 'all'
        ? { contractId }
        : {
            contractId,
            user: {
              isActive: status === 'active',
            },
          };

    return prisma.professor.findMany({
      where,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
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
      throw new Error('Professor não encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('NÃ£o Ã© possÃ­vel desativar o professor master');
    }

    const managedCollaboratorsCount = await countManagedCollaborators(professor.id);

    if (managedCollaboratorsCount > 0) {
      throw new Error('Reatribua os colaboradores vinculados antes de desativar este gestor');
    }

    return prisma.user.update({
      where: { id: professor.userId },
      data: { isActive: false },
    });
  },

  /**
   * Reativar professor
   */
  async activate(contractId: string, professorId: string) {
    const professor = await prisma.professor.findFirst({
      where: { id: professorId, contractId },
    });

    if (!professor) {
      throw new Error('Professor não encontrado');
    }
    if (professor.role === 'master') {
      throw new Error('Não é possível reativar o professor master por esta tela');
    }

    return prisma.user.update({
      where: { id: professor.userId },
      data: { isActive: true },
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
      throw new Error('Professor não encontrado');
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
        collaboratorFunction: true,
      },
    });

    if (!professor) {
      throw new Error('Professor não encontrado');
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
        throw new Error('E-mail já está registrado');
      }
    }

    const updateUserData: any = {};
    const updateProfileData: any = {};
    const updateProfessorData: any = {};
    let targetCollaboratorFunction = professor.collaboratorFunction;

    if (normalizedEmail) {
      updateUserData.email = normalizedEmail;
    }

    if (typeof data.password === 'string' && data.password.trim().length > 0) {
      updateUserData.passwordHash = await bcryptjs.hash(data.password, 10);
    }

    if (normalizedName) {
      updateProfileData.name = normalizedName;
    }

    if (data.collaboratorFunctionId) {
      const collaboratorFunction = await getCollaboratorFunctionForContract(
        contractId,
        data.collaboratorFunctionId
      );

      if (!collaboratorFunction.isActive && collaboratorFunction.id !== professor.collaboratorFunctionId) {
        throw new Error('A função selecionada está inativa');
      }

      updateProfessorData.collaboratorFunctionId = collaboratorFunction.id;
      targetCollaboratorFunction = collaboratorFunction;
    }

    const managedCollaboratorsCount = await countManagedCollaborators(professorId);

    if (
      managedCollaboratorsCount > 0 &&
      !canLeadCollaborators({
        role: professor.role,
        collaboratorFunction: targetCollaboratorFunction,
      })
    ) {
      throw new Error(
        'Reatribua os colaboradores vinculados antes de remover a função de gestor deste colaborador'
      );
    }

    if (requiresResponsibleManager(targetCollaboratorFunction.code)) {
      const desiredResponsibleManagerId =
        data.responsibleManagerId ?? professor.responsibleManagerId;

      if (!desiredResponsibleManagerId) {
        throw new Error('Selecione um gestor responsável para este colaborador');
      }

      if (desiredResponsibleManagerId === professorId) {
        throw new Error('Um colaborador não pode ser o próprio gestor responsável');
      }

      const responsibleManager = await getResponsibleManagerForContract(
        contractId,
        desiredResponsibleManagerId
      );

      updateProfessorData.responsibleManagerId = responsibleManager.id;
    } else {
      updateProfessorData.responsibleManagerId = null;
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

      if (Object.keys(updateProfessorData).length > 0) {
        await tx.professor.update({
          where: { id: professorId },
          data: updateProfessorData,
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
          contract: true,
        },
      });
    });
  },
};

