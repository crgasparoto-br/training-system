import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UpdateContractDTO {
  name?: string;
  document?: string;
}

export const contractService = {
  async getById(contractId: string) {
    return prisma.contract.findUnique({
      where: { id: contractId },
    });
  },

  async getFirstSourceContract(excludeId: string) {
    return prisma.contract.findFirst({
      where: { id: { not: excludeId } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async update(contractId: string, data: UpdateContractDTO) {
    return prisma.contract.update({
      where: { id: contractId },
      data,
    });
  },
};
