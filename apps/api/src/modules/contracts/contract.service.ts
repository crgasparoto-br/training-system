import { PrismaClient } from '@prisma/client';
import {
  selectCloneSourceCandidate,
  type CloneSourceCandidate,
} from './contract-clone-source-selection.js';

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

const countByContract = <T extends { contractId: string; _count: { _all: number } }>(rows: T[]) =>
  new Map(rows.map((row) => [row.contractId, row._count._all]));

export const contractService = {
  async getById(contractId: string) {
    return prisma.companyContract.findUnique({
      where: { id: contractId },
    });
  },

  async getFirstSourceContract(excludeId: string) {
    return prisma.companyContract.findFirst({
      where: { id: { not: excludeId } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async getBestCloneSourceContract(excludeId: string, preferredId?: string | null) {
    const [contracts, parameterCounts, exerciseCounts, assessmentTypeCounts] = await Promise.all([
      prisma.companyContract.findMany({
        where: { id: { not: excludeId } },
        select: { id: true, createdAt: true },
      }),
      prisma.trainingParameter.groupBy({
        by: ['contractId'],
        where: { contractId: { not: excludeId } },
        _count: { _all: true },
      }),
      prisma.exerciseLibrary.groupBy({
        by: ['contractId'],
        where: { contractId: { not: excludeId } },
        _count: { _all: true },
      }),
      prisma.assessmentType.groupBy({
        by: ['contractId'],
        where: { contractId: { not: excludeId } },
        _count: { _all: true },
      }),
    ]);

    const parametersByContract = countByContract(parameterCounts);
    const exercisesByContract = countByContract(exerciseCounts);
    const assessmentTypesByContract = countByContract(assessmentTypeCounts);

    const candidates: CloneSourceCandidate[] = contracts.map((contract) => ({
      id: contract.id,
      createdAt: contract.createdAt,
      parameters: parametersByContract.get(contract.id) ?? 0,
      exercises: exercisesByContract.get(contract.id) ?? 0,
      assessmentTypes: assessmentTypesByContract.get(contract.id) ?? 0,
    }));

    return selectCloneSourceCandidate(candidates, preferredId);
  },

  async update(contractId: string, data: UpdateContractDTO) {
    return prisma.companyContract.update({
      where: { id: contractId },
      data,
    });
  },
};
