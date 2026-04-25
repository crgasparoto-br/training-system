import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SERVICES = [
  { code: 'personal_trainer', name: 'Personal Trainer' },
  { code: 'consultoria_esportiva', name: 'Consultoria Esportiva' },
  { code: 'avaliacao_fisica_avulsa', name: 'Avaliação Física Avulsa' },
] as const;

type DbClient = PrismaClient | Prisma.TransactionClient;

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function slugify(value: string) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

async function buildUniqueCode(contractId: string, name: string, client: DbClient, ignoreId?: string) {
  const baseCode = slugify(name) || 'servico';

  const existing = await client.serviceOption.findMany({
    where: { contractId },
    select: { id: true, code: true },
  });

  const taken = new Set(existing.filter((item) => item.id !== ignoreId).map((item) => item.code));

  if (!taken.has(baseCode)) {
    return baseCode;
  }

  let suffix = 2;
  while (taken.has(`${baseCode}_${suffix}`)) {
    suffix += 1;
  }

  return `${baseCode}_${suffix}`;
}

async function assertNameAvailable(contractId: string, name: string, client: DbClient, ignoreId?: string) {
  const existing = await client.serviceOption.findFirst({
    where: {
      contractId,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      name: {
        equals: normalizeName(name),
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    throw new Error('Já existe um serviço com este nome');
  }
}

export async function ensureDefaultServicesForContract(contractId: string, client: DbClient = prisma) {
  const existing = await client.serviceOption.findMany({
    where: { contractId },
    select: { code: true },
  });

  const existingCodes = new Set(existing.map((item) => item.code));
  const missingDefaults = DEFAULT_SERVICES.filter((item) => !existingCodes.has(item.code));

  if (missingDefaults.length > 0) {
    await client.serviceOption.createMany({
      data: missingDefaults.map((item) => ({
        contractId,
        code: item.code,
        name: item.name,
        isActive: true,
        isSystem: true,
      })),
    });
  }

  return client.serviceOption.findMany({
    where: { contractId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export async function getServiceForContract(contractId: string, serviceId: string, client: DbClient = prisma) {
  const service = await client.serviceOption.findFirst({
    where: {
      id: serviceId,
      contractId,
    },
  });

  if (!service) {
    throw new Error('Serviço não encontrado');
  }

  return service;
}

export const serviceCatalogService = {
  async listByContract(contractId: string, includeInactive = true) {
    await ensureDefaultServicesForContract(contractId);

    return prisma.serviceOption.findMany({
      where: {
        contractId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  },

  async create(contractId: string, data: { name: string; isActive?: boolean }) {
    const normalizedName = normalizeName(data.name);

    await assertNameAvailable(contractId, normalizedName, prisma);

    const code = await buildUniqueCode(contractId, normalizedName, prisma);

    return prisma.serviceOption.create({
      data: {
        contractId,
        name: normalizedName,
        code,
        isActive: data.isActive ?? true,
        isSystem: false,
      },
    });
  },

  async update(contractId: string, serviceId: string, data: { name?: string; isActive?: boolean }) {
    const existing = await getServiceForContract(contractId, serviceId);
    const updateData: Prisma.ServiceOptionUpdateInput = {};

    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      const normalizedName = normalizeName(data.name);
      await assertNameAvailable(contractId, normalizedName, prisma, serviceId);
      updateData.name = normalizedName;
      updateData.code = await buildUniqueCode(contractId, normalizedName, prisma, serviceId);
    }

    if (typeof data.isActive === 'boolean') {
      updateData.isActive = data.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    return prisma.serviceOption.update({
      where: { id: serviceId },
      data: updateData,
    });
  },
};