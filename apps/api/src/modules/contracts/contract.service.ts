import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UpdateContractDTO {
  name?: string;
  document?: string;
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
