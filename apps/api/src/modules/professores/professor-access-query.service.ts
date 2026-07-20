import { Prisma, PrismaClient } from '@prisma/client';
import type { AccessDataScope } from '@corrida/types';
import { buildProfessorDataScopeWhere } from '../access-control/index.js';

const prisma = new PrismaClient();

const profileAuditInclude = Prisma.validator<Prisma.ProfileInclude>()({
  legalFinancialProvidedByProfessor: {
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  },
  legalFinancialValidatedByProfessor: {
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  },
});

const professorDetailInclude = Prisma.validator<Prisma.ProfessorInclude>()({
  user: {
    include: {
      profile: {
        include: profileAuditInclude,
      },
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
});

export const professorAccessQueryService = {
  async findByAccessScope(
    contractId: string,
    actorProfessorId: string | undefined,
    scope: AccessDataScope,
    professorId: string
  ) {
    return prisma.professor.findFirst({
      where: {
        AND: [
          { id: professorId },
          buildProfessorDataScopeWhere(contractId, actorProfessorId, scope),
        ],
      },
      include: professorDetailInclude,
    });
  },
};
