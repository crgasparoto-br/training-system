import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ExternalBank = {
  ispb?: string | null;
  code?: number | null;
  name?: string | null;
  fullName?: string | null;
};

function formatBankCode(code: number) {
  return code.toString().padStart(3, '0');
}

function normalizeDescription(bank: ExternalBank) {
  return (bank.fullName || bank.name || '').trim();
}

async function syncCatalogFromProvider() {
  const response = await fetch('https://brasilapi.com.br/api/banks/v1');

  if (!response.ok) {
    throw new Error('Não foi possível sincronizar o catálogo de bancos');
  }

  const payload = (await response.json()) as ExternalBank[];
  const banks = payload
    .filter(
      (item): item is ExternalBank & { code: number } =>
        typeof item.code === 'number' && Number.isFinite(item.code) && item.code >= 0
    )
    .map((item) => ({
      code: formatBankCode(item.code),
      description: normalizeDescription(item),
      ispb: item.ispb?.trim() || null,
    }))
    .filter((item) => item.description.length > 0)
    .sort((first, second) => first.code.localeCompare(second.code));

  for (const bank of banks) {
    await prisma.bank.upsert({
      where: { code: bank.code },
      update: {
        description: bank.description,
        ispb: bank.ispb,
      },
      create: bank,
    });
  }
}

async function ensureCatalogLoaded() {
  const totalBanks = await prisma.bank.count();

  if (totalBanks === 0) {
    await syncCatalogFromProvider();
  }
}

export const bankService = {
  async list() {
    await ensureCatalogLoaded();

    return prisma.bank.findMany({
      select: {
        code: true,
        description: true,
      },
      orderBy: {
        code: 'asc',
      },
    });
  },

  async sync() {
    await syncCatalogFromProvider();

    return prisma.bank.findMany({
      select: {
        code: true,
        description: true,
      },
      orderBy: {
        code: 'asc',
      },
    });
  },

  async findByCode(code?: string | null) {
    if (!code) {
      return null;
    }

    await ensureCatalogLoaded();

    return prisma.bank.findUnique({
      where: { code: code.trim() },
      select: {
        code: true,
        description: true,
      },
    });
  },
};