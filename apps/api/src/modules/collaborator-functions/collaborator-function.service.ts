import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_COLLABORATOR_FUNCTIONS = [
  { code: 'professor', name: 'Professor' },
  { code: 'intern', name: 'Estagiário' },
  { code: 'manager', name: 'Gestor' },
  { code: 'administrative', name: 'Administrativo' },
  { code: 'cleaning', name: 'Limpeza' },
  { code: 'services', name: 'Serviços' },
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

async function buildUniqueCode(
  contractId: string,
  name: string,
  client: DbClient,
  ignoreId?: string
) {
  const baseCode = slugify(name) || 'funcao';

  const existing = await client.collaboratorFunctionOption.findMany({
    where: { contractId },
    select: { id: true, code: true },
  });

  const taken = new Set(
    existing.filter((item) => item.id !== ignoreId).map((item) => item.code)
  );

  if (!taken.has(baseCode)) {
    return baseCode;
  }

  let suffix = 2;
  while (taken.has(`${baseCode}_${suffix}`)) {
    suffix += 1;
  }

  return `${baseCode}_${suffix}`;
}

async function assertNameAvailable(
  contractId: string,
  name: string,
  client: DbClient,
  ignoreId?: string
) {
  const existing = await client.collaboratorFunctionOption.findFirst({
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
    throw new Error('Já existe uma função com este nome');
  }
}

export async function ensureDefaultCollaboratorFunctionsForContract(
  contractId: string,
  client: DbClient = prisma
) {
  await client.collaboratorFunctionOption.updateMany({
    where: {
      contractId,
      code: 'cleaning_services',
      isSystem: true,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  const existing = await client.collaboratorFunctionOption.findMany({
    where: { contractId },
    select: { code: true },
  });

  const existingCodes = new Set(existing.map((item) => item.code));
  const missingDefaults = DEFAULT_COLLABORATOR_FUNCTIONS.filter(
    (item) => !existingCodes.has(item.code)
  );

  if (missingDefaults.length > 0) {
    await client.collaboratorFunctionOption.createMany({
      data: missingDefaults.map((item) => ({
        contractId,
        code: item.code,
        name: item.name,
        isActive: true,
        isSystem: true,
      })),
    });
  }

  return client.collaboratorFunctionOption.findMany({
    where: { contractId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export async function getDefaultCollaboratorFunctionByCode(
  contractId: string,
  code: (typeof DEFAULT_COLLABORATOR_FUNCTIONS)[number]['code'],
  client: DbClient = prisma
) {
  await ensureDefaultCollaboratorFunctionsForContract(contractId, client);

  return client.collaboratorFunctionOption.findUnique({
    where: {
      contractId_code: {
        contractId,
        code,
      },
    },
  });
}

export async function getCollaboratorFunctionForContract(
  contractId: string,
  collaboratorFunctionId: string,
  client: DbClient = prisma
) {
  const collaboratorFunction = await client.collaboratorFunctionOption.findFirst({
    where: {
      id: collaboratorFunctionId,
      contractId,
    },
  });

  if (!collaboratorFunction) {
    throw new Error('Função do colaborador não encontrada');
  }

  return collaboratorFunction;
}

export const collaboratorFunctionService = {
  async listByContract(contractId: string) {
    return ensureDefaultCollaboratorFunctionsForContract(contractId);
  },

  async create(contractId: string, data: { name: string; isActive?: boolean }) {
    const normalizedName = normalizeName(data.name);

    await assertNameAvailable(contractId, normalizedName, prisma);

    const code = await buildUniqueCode(contractId, normalizedName, prisma);

    return prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: normalizedName,
        code,
        isActive: data.isActive ?? true,
        isSystem: false,
      },
    });
  },

  async update(
    contractId: string,
    collaboratorFunctionId: string,
    data: { name?: string; isActive?: boolean }
  ) {
    const existing = await getCollaboratorFunctionForContract(contractId, collaboratorFunctionId);
    const updateData: Prisma.CollaboratorFunctionOptionUpdateInput = {};

    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      const normalizedName = normalizeName(data.name);
      await assertNameAvailable(contractId, normalizedName, prisma, collaboratorFunctionId);
      updateData.name = normalizedName;
      updateData.code = await buildUniqueCode(contractId, normalizedName, prisma, collaboratorFunctionId);
    }

    if (typeof data.isActive === 'boolean') {
      updateData.isActive = data.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    return prisma.collaboratorFunctionOption.update({
      where: { id: collaboratorFunctionId },
      data: updateData,
    });
  },
};