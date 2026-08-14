import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UpdateContractDTO {
  name?: string;
  document?: string;
  tradeName?: string | null;
  cref?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressComplement?: string | null;
  addressZipCode?: string | null;
  logoUrl?: string | null;
}

export interface CloneSourceCandidate {
  id: string;
  createdAt: Date;
  _count: {
    trainingParameters: number;
    exerciseLibrary: number;
    assessmentTypes: number;
  };
}

function cloneSourceCoverage(candidate: CloneSourceCandidate) {
  return [
    candidate._count.trainingParameters,
    candidate._count.exerciseLibrary,
    candidate._count.assessmentTypes,
  ].filter((count) => count > 0).length;
}

function cloneSourceTotal(candidate: CloneSourceCandidate) {
  return (
    candidate._count.trainingParameters +
    candidate._count.exerciseLibrary +
    candidate._count.assessmentTypes
  );
}

export function selectBestCloneSourceContract(candidates: CloneSourceCandidate[]) {
  const eligible = candidates.filter((candidate) => cloneSourceTotal(candidate) > 0);

  if (eligible.length === 0) {
    return null;
  }

  const withExercises = eligible.filter((candidate) => candidate._count.exerciseLibrary > 0);
  const pool = withExercises.length > 0 ? withExercises : eligible;

  return [...pool].sort((left, right) => {
    const coverageDifference = cloneSourceCoverage(right) - cloneSourceCoverage(left);
    if (coverageDifference !== 0) {
      return coverageDifference;
    }

    const totalDifference = cloneSourceTotal(right) - cloneSourceTotal(left);
    if (totalDifference !== 0) {
      return totalDifference;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}

export const contractService = {
  async getById(contractId: string) {
    return prisma.companyContract.findUnique({
      where: { id: contractId },
    });
  },

  async getFirstSourceContract(excludeId: string) {
    const candidates = await prisma.companyContract.findMany({
      where: { id: { not: excludeId } },
      select: {
        id: true,
        createdAt: true,
        _count: {
          select: {
            trainingParameters: true,
            exerciseLibrary: true,
            assessmentTypes: true,
          },
        },
      },
    });

    return selectBestCloneSourceContract(candidates);
  },

  async update(contractId: string, data: UpdateContractDTO) {
    return prisma.companyContract.update({
      where: { id: contractId },
      data,
    });
  },
};
