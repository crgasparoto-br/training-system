import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_HOURLY_RATE_LEVELS = [
  { code: 'bronze', label: 'Bronze', order: 1 },
  { code: 'silver', label: 'Prata', order: 2 },
  { code: 'gold', label: 'Ouro', order: 3 },
] as const;

type HourlyRateLevelCode = (typeof DEFAULT_HOURLY_RATE_LEVELS)[number]['code'];

type HourlyRateLevelInput = {
  code: HourlyRateLevelCode;
  minValue: number | null;
  maxValue: number | null;
};

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
      minValue: normalizeMoneyValue(level.minValue),
      maxValue: normalizeMoneyValue(level.maxValue),
    }))
    .sort((first, second) => (first.minValue ?? 0) - (second.minValue ?? 0));

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
  await Promise.all(
    DEFAULT_HOURLY_RATE_LEVELS.map((level) =>
      prisma.hourlyRateLevel.upsert({
        where: {
          contractId_code: {
            contractId,
            code: level.code,
          },
        },
        update: {
          label: level.label,
          order: level.order,
          isActive: true,
        },
        create: {
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

  async updateByContract(contractId: string, levels: HourlyRateLevelInput[]) {
    await ensureDefaultHourlyRateLevelsForContract(contractId);

    const nextLevels = DEFAULT_HOURLY_RATE_LEVELS.map((defaultLevel) => {
      const payloadLevel = levels.find((level) => level.code === defaultLevel.code);

      if (!payloadLevel) {
        throw new Error('Envie as três faixas de nível: Bronze, Prata e Ouro');
      }

      return payloadLevel;
    });

    const validatedLevels = validateRanges(nextLevels);

    await prisma.$transaction(
      validatedLevels.map((level) => {
        const defaults = DEFAULT_HOURLY_RATE_LEVELS.find((item) => item.code === level.code)!;

        return prisma.hourlyRateLevel.update({
          where: {
            contractId_code: {
              contractId,
              code: level.code,
            },
          },
          data: {
            label: defaults.label,
            minValue: level.minValue,
            maxValue: level.maxValue,
            order: defaults.order,
            isActive: true,
          },
        });
      })
    );

    return this.listByContract(contractId);
  },
};