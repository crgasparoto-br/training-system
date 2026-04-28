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

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== 'string') {
    return value ?? undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
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

async function assertParentServiceValid(
  contractId: string,
  parentServiceId: string,
  client: DbClient,
  ignoreId?: string
) {
  const parentService = await client.serviceOption.findFirst({
    where: {
      id: parentServiceId,
      contractId,
    },
  });

  if (!parentService) {
    throw new Error('Serviço base não encontrado');
  }

  if (ignoreId && parentService.id === ignoreId) {
    throw new Error('Um serviço não pode ser vinculado a si mesmo');
  }

  if (parentService.parentServiceId) {
    throw new Error('Selecione um serviço base válido para a oferta financeira');
  }

  return parentService;
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
      include: {
        parentService: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  },

  async create(contractId: string, data: {
    name: string;
    description?: string;
    parentServiceId?: string;
    monthlyPrice?: number;
    validFrom?: Date;
    validUntil?: Date;
    isActive?: boolean;
  }) {
    const normalizedName = normalizeName(data.name);
    const normalizedDescription = normalizeOptionalText(data.description);

    await assertNameAvailable(contractId, normalizedName, prisma);

    const parentServiceId = data.parentServiceId
      ? (await assertParentServiceValid(contractId, data.parentServiceId, prisma)).id
      : undefined;

    const code = await buildUniqueCode(contractId, normalizedName, prisma);

    return prisma.serviceOption.create({
      data: {
        contractId,
        name: normalizedName,
        code,
        description: normalizedDescription,
        parentServiceId,
        monthlyPrice: data.monthlyPrice,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: data.isActive ?? true,
        isSystem: false,
      },
      include: {
        parentService: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async update(contractId: string, serviceId: string, data: {
    name?: string;
    description?: string | null;
    parentServiceId?: string | null;
    monthlyPrice?: number | null;
    validFrom?: Date | null;
    validUntil?: Date | null;
    isActive?: boolean;
  }) {
    const existing = await getServiceForContract(contractId, serviceId);
    const updateData: Prisma.ServiceOptionUpdateInput = {};

    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      const normalizedName = normalizeName(data.name);
      await assertNameAvailable(contractId, normalizedName, prisma, serviceId);
      updateData.name = normalizedName;
      updateData.code = await buildUniqueCode(contractId, normalizedName, prisma, serviceId);
    }

    if (data.description !== undefined) {
      updateData.description = normalizeOptionalText(data.description) ?? null;
    }

    if (data.parentServiceId !== undefined) {
      if (data.parentServiceId === null) {
        updateData.parentService = { disconnect: true };
      } else {
        const parentService = await assertParentServiceValid(contractId, data.parentServiceId, prisma, serviceId);
        updateData.parentService = {
          connect: { id: parentService.id },
        };
      }
    }

    if (data.monthlyPrice !== undefined) {
      updateData.monthlyPrice = data.monthlyPrice;
    }

    if (data.validFrom !== undefined) {
      updateData.validFrom = data.validFrom;
    }

    if (data.validUntil !== undefined) {
      updateData.validUntil = data.validUntil;
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
      include: {
        parentService: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
};