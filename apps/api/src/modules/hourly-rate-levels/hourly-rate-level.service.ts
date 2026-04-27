import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_HOURLY_RATE_LEVELS = [
  { code: 'bronze', label: 'Bronze', order: 1 },
  { code: 'silver', label: 'Prata', order: 2 },
  { code: 'gold', label: 'Ouro', order: 3 },
] as const;

type HourlyRateLevelCode = (typeof DEFAULT_HOURLY_RATE_LEVELS)[number]['code'];

type HourlyRateLevelInput = {
  id: string;
  label: string;
  code: string;
  order: number;
  minValue: number | null;
  maxValue: number | null;
};

function normalizeLabel(label?: string | null) {
  if (typeof label !== 'string') {
    throw new Error('Informe o nome do nível');
  }

  const normalizedLabel = label.trim();

  if (!normalizedLabel) {
    throw new Error('Informe o nome do nível');
  }

  return normalizedLabel;
}

function normalizeCode(value: string) {
  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue || 'nivel';
}

async function generateUniqueCode(contractId: string, label: string) {
  const baseCode = normalizeCode(label);
  let nextCode = baseCode;
  let suffix = 2;

  while (
    await prisma.hourlyRateLevel.findUnique({
      where: {
        contractId_code: {
          contractId,
          code: nextCode,
        },
      },
      select: { id: true },
    })
  ) {
    nextCode = `${baseCode}-${suffix}`;
    suffix += 1;
  }

  return nextCode;
}

function normalizeMoneyValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error('Informe um valor inicial/final válido para a faixa');
  }

  return Number(value.toFixed(2));
}

function validateRanges(levels: HourlyRateLevelInput[]) {
  const normalizedLevels = levels
    .map((level) => ({
      ...level,
      label: normalizeLabel(level.label),
      minValue: normalizeMoneyValue(level.minValue),
      maxValue: normalizeMoneyValue(level.maxValue),
    }))
    .sort((first, second) => first.order - second.order);

  const labels = new Set<string>();

  for (const level of normalizedLevels) {
    const comparableLabel = level.label.toLocaleLowerCase('pt-BR');

    if (labels.has(comparableLabel)) {
      throw new Error('Os níveis não podem ter nomes repetidos');
    }

    labels.add(comparableLabel);
  }

  for (const level of normalizedLevels) {
    if (level.minValue === null || level.maxValue === null) {
      throw new Error('Preencha o valor inicial e o valor final de todos os níveis');
    }

    if (level.minValue > level.maxValue) {
      throw new Error(`A faixa do nível ${level.code} está inválida`);
    }
  }

  for (let index = 1; index < normalizedLevels.length; index += 1) {
    const previous = normalizedLevels[index - 1];
    const current = normalizedLevels[index];

    if ((previous.maxValue ?? 0) >= (current.minValue ?? 0)) {
      throw new Error('As faixas dos níveis não podem se sobrepor');
    }
  }

  return normalizedLevels;
}

export async function ensureDefaultHourlyRateLevelsForContract(contractId: string) {
  const existingLevels = await prisma.hourlyRateLevel.count({ where: { contractId } });

  if (existingLevels > 0) {
    return;
  }

  await Promise.all(
    DEFAULT_HOURLY_RATE_LEVELS.map((level) =>
      prisma.hourlyRateLevel.create({
        data: {
          contractId,
          code: level.code,
          label: level.label,
          order: level.order,
          isActive: true,
        },
      })
    )
  );
}

export const hourlyRateLevelService = {
  async listByContract(contractId: string) {
    await ensureDefaultHourlyRateLevelsForContract(contractId);

    return prisma.hourlyRateLevel.findMany({
      where: { contractId },
      orderBy: { order: 'asc' },
    });
  },

  async createByContract(contractId: string) {
    await ensureDefaultHourlyRateLevelsForContract(contractId);

    const levels = await prisma.hourlyRateLevel.findMany({
      where: { contractId },
      orderBy: { order: 'asc' },
      select: { order: true, label: true },
    });

    const nextOrder = (levels.at(-1)?.order ?? 0) + 1;
    const nextLabel = `Novo nível ${nextOrder}`;
    const nextCode = await generateUniqueCode(contractId, nextLabel);

    await prisma.hourlyRateLevel.create({
      data: {
        contractId,
        code: nextCode,
        label: nextLabel,
        order: nextOrder,
        isActive: true,
      },
    });

    return this.listByContract(contractId);
  },

  async deleteByContract(contractId: string, levelId: string) {
    await ensureDefaultHourlyRateLevelsForContract(contractId);

    const existingLevel = await prisma.hourlyRateLevel.findFirst({
      where: { id: levelId, contractId },
      select: { id: true },
    });

    if (!existingLevel) {
      throw new Error('Nível de valor/hora não encontrado');
    }

    const totalLevels = await prisma.hourlyRateLevel.count({ where: { contractId } });

    if (totalLevels <= 1) {
      throw new Error('Mantenha pelo menos um nível cadastrado');
    }

    await prisma.$transaction(async (tx) => {
      await tx.hourlyRateLevel.delete({
        where: { id: levelId },
      });

      const remainingLevels = await tx.hourlyRateLevel.findMany({
        where: { contractId },
        orderBy: { order: 'asc' },
        select: { id: true },
      });

      await Promise.all(
        remainingLevels.map((level, index) =>
          tx.hourlyRateLevel.update({
            where: { id: level.id },
            data: { order: index + 1 },
          })
        )
      );
    });

    return this.listByContract(contractId);
  },

  async updateByContract(contractId: string, levels: HourlyRateLevelInput[]) {
    await ensureDefaultHourlyRateLevelsForContract(contractId);

    if (levels.length === 0) {
      throw new Error('Cadastre ao menos um nível de valor/hora');
    }

    const existingLevels = await prisma.hourlyRateLevel.findMany({
      where: { contractId },
      select: { id: true, code: true },
    });

    const existingLevelIds = new Set(existingLevels.map((level) => level.id));

    for (const level of levels) {
      if (!existingLevelIds.has(level.id)) {
        throw new Error('Envie apenas níveis existentes deste contrato');
      }
    }

    const validatedLevels = validateRanges(levels);

    await prisma.$transaction(
      validatedLevels.map((level) =>
        prisma.hourlyRateLevel.update({
          where: { id: level.id },
          data: {
            label: level.label,
            minValue: level.minValue,
            maxValue: level.maxValue,
            order: level.order,
            isActive: true,
          },
        })
      )
    );

    return this.listByContract(contractId);
  },
};