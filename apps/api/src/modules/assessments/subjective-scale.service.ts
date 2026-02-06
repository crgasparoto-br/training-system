import { PrismaClient, type Prisma, type SubjectiveScaleType } from '@prisma/client';

const prisma = new PrismaClient();

type ScaleSeedItem = {
  value: number;
  label?: string | null;
};

const DEFAULT_SCALES: Record<SubjectiveScaleType, ScaleSeedItem[]> = {
  PSE: [
    { value: 0, label: 'MUITO, MUITO FÁCIL' },
    { value: 1, label: 'MUITO FÁCIL' },
    { value: 2, label: null },
    { value: 3, label: 'RAZOAVELMENTE FÁCIL' },
    { value: 4, label: 'UM POUCO DIFÍCIL' },
    { value: 5, label: 'DIFÍCIL' },
    { value: 6, label: null },
    { value: 7, label: 'MUITO DIFÍCIL' },
    { value: 8, label: null },
    { value: 9, label: 'MUITO, MUITO DIFÍCIL' },
    { value: 10, label: 'ESFORÇO MÁXIMO' },
  ],
  PSR: [
    { value: 0, label: 'MUITO MAL RECUPERADO' },
    { value: 1, label: 'MUITO POUCA RECUPERAÇÃO' },
    { value: 2, label: 'POUCA RECUPERAÇÃO' },
    { value: 3, label: 'RECUPERAÇÃO MODERADA' },
    { value: 4, label: 'BOA RECUPERAÇÃO' },
    { value: 5, label: 'MUITO BOA RECUPERAÇÃO' },
    { value: 6, label: null },
    { value: 7, label: 'MUITO, MUITO BOA RECUPERAÇÃO' },
    { value: 8, label: null },
    { value: 9, label: null },
    { value: 10, label: 'TOTALMENTE RECUPERADO' },
  ],
};

export async function ensureDefaultSubjectiveScales(
  tx: Prisma.TransactionClient,
  contractId: string
) {
  const existing = await tx.subjectiveScaleItem.count({
    where: { contractId },
  });

  if (existing > 0) {
    return;
  }

  const data = (Object.keys(DEFAULT_SCALES) as SubjectiveScaleType[]).flatMap(
    (type) =>
      DEFAULT_SCALES[type].map((item) => ({
        contractId,
        type,
        value: item.value,
        label: item.label ? item.label.trim() : null,
        order: item.value,
        isActive: true,
      }))
  );

  await tx.subjectiveScaleItem.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function ensureDefaultSubjectiveScalesForContract(contractId: string) {
  await prisma.$transaction(async (tx) => {
    await ensureDefaultSubjectiveScales(tx, contractId);
  });
}

export const subjectiveScaleService = {
  async listByContract(contractId: string, type?: SubjectiveScaleType) {
    return prisma.subjectiveScaleItem.findMany({
      where: {
        contractId,
        ...(type ? { type } : {}),
      },
      orderBy: [{ type: 'asc' }, { order: 'asc' }],
    });
  },
};
