import { PrismaClient, type Prisma, type StudentContractStatus } from '@prisma/client';
import { prepareOrActivateStudentContractInTransaction } from './student-contract-lifecycle-transaction.js';
import { parseActiveContractTemplateReference } from './student-contract-reference.js';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CreateStudentContractInput = {
  alunoId: string;
  contractId: string;
  serviceId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  signedAt?: Date | null;
  canceledAt?: Date | null;
  cancellationReason?: string | null;
  amount?: number | Prisma.Decimal | null;
  paymentDay?: number | null;
  notes?: string | null;
  status?: StudentContractStatus;
};

export type UpdateStudentContractStatusOptions = {
  startDate?: Date | null;
  endDate?: Date | null;
  signedAt?: Date | null;
  canceledAt?: Date | null;
  cancellationReason?: string | null;
};

export type UpdateStudentContractInput = {
  serviceId?: string | null;
  status?: StudentContractStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  signedAt?: Date | null;
  canceledAt?: Date | null;
  cancellationReason?: string | null;
  amount?: number | Prisma.Decimal | null;
  paymentDay?: number | null;
  notes?: string | null;
};

type ServiceOperationOptions = {
  companyContractId?: string;
};

async function runInTransaction<T>(
  client: DbClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const prismaClient = client as PrismaClient;
  if (typeof prismaClient.$transaction === 'function') {
    return prismaClient.$transaction(work);
  }
  return work(client as Prisma.TransactionClient);
}

async function getContractScoped(
  contractId: string,
  companyContractId: string | undefined,
  client: DbClient
) {
  const contract = await client.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      alunoId: true,
      companyContractId: true,
      serviceId: true,
      status: true,
    },
  });

  if (!contract) {
    throw new Error('Contrato gerado não encontrado');
  }

  if (companyContractId && contract.companyContractId !== companyContractId) {
    throw new Error('Contrato não pertence ao contrato do professor');
  }

  return contract;
}

async function resolveAuthoritativeFinancialServiceId(
  alunoId: string,
  contractServiceId: string | null | undefined,
  companyContractId: string | undefined,
  client: DbClient
) {
  if (!companyContractId) {
    throw new Error('Contrato da empresa não encontrado');
  }

  const aluno = await client.aluno.findUnique({
    where: { id: alunoId },
    select: {
      serviceId: true,
      professor: { select: { contractId: true } },
    },
  });

  if (!aluno || aluno.professor.contractId !== companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }

  const serviceId = contractServiceId?.trim() || aluno.serviceId?.trim() || null;
  if (!serviceId) return null;

  const service = await client.serviceOption.findFirst({
    where: { id: serviceId, contractId: companyContractId },
    select: { id: true },
  });
  if (!service) {
    throw new Error('Serviço financeiro do contrato não pertence ao contrato autenticado');
  }

  return service.id;
}

async function generateContractFromActiveTemplate(
  data: CreateStudentContractInput,
  options: ServiceOperationOptions,
  client: DbClient
) {
  const templateId = parseActiveContractTemplateReference(data.contractId);
  if (!templateId) {
    return null;
  }

  if (data.status && data.status !== 'draft' && data.status !== 'active') {
    throw new Error('Estado não suportado para geração de contrato por modelo');
  }

  const companyContractId = options.companyContractId;
  if (!companyContractId) {
    throw new Error('Contrato da empresa não encontrado');
  }

  return runInTransaction(client, async (tx) => {
    const template = await tx.contractTemplate.findFirst({
      where: {
        id: templateId,
        contractId: companyContractId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        serviceId: true,
      },
    });

    if (!template) {
      throw new Error('Modelo de contrato ativo não encontrado');
    }

    await resolveAuthoritativeFinancialServiceId(
      data.alunoId,
      template.serviceId,
      companyContractId,
      tx
    );

    const { contractAuthoritativeGenerationService } = await import(
      '../contracts/contract-authoritative-generation.service.js'
    );
    const generatedContract = await contractAuthoritativeGenerationService.generate(
      companyContractId,
      {
        templateId: template.id,
        alunoId: data.alunoId,
        valorMensal:
          data.amount === null || data.amount === undefined
            ? undefined
            : Number(data.amount),
        diaVencimento: data.paymentDay ?? undefined,
        dataInicio: data.startDate ?? undefined,
        horarios: data.notes ?? undefined,
      },
      undefined,
      tx,
      {
        endDate: data.endDate ?? null,
        requestedStatus: data.status === 'active' ? 'active' : 'draft',
      }
    );

    const generatedLink = await tx.studentContract.findUnique({
      where: { contractId: generatedContract.id },
    });

    if (!generatedLink) {
      throw new Error('Não foi possível criar o vínculo do contrato gerado');
    }

    return generatedLink;
  });
}

async function assertStudentContractOwnership(
  studentContractId: string,
  alunoId: string,
  companyContractId: string | undefined,
  client: DbClient
) {
  const existing = await client.studentContract.findUnique({
    where: { id: studentContractId },
    include: {
      contract: {
        select: {
          id: true,
          companyContractId: true,
          status: true,
        },
      },
    },
  });

  if (!existing || existing.alunoId !== alunoId) {
    throw new Error('Vínculo de contrato do aluno não encontrado');
  }

  if (companyContractId && existing.contract.companyContractId !== companyContractId) {
    throw new Error('Vínculo de contrato fora do escopo do professor');
  }

  return existing;
}

async function syncAlunoCurrentContract(
  alunoId: string,
  studentContractId: string,
  status: StudentContractStatus,
  client: DbClient
) {
  if (status === 'active') {
    await client.aluno.update({
      where: { id: alunoId },
      data: { currentStudentContractId: studentContractId },
    });
    return;
  }

  if (status === 'canceled' || status === 'expired' || status === 'terminated') {
    await client.aluno.updateMany({
      where: { id: alunoId, currentStudentContractId: studentContractId },
      data: { currentStudentContractId: null },
    });
  }
}

export const studentContractService = {
  async listByAluno(
    alunoId: string,
    options: ServiceOperationOptions = {},
    client: DbClient = prisma
  ) {
    return client.studentContract.findMany({
      where: {
        alunoId,
        ...(options.companyContractId
          ? {
              contract: {
                companyContractId: options.companyContractId,
              },
            }
          : {}),
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            monthlyPrice: true,
            isActive: true,
          },
        },
        contract: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            signedAt: true,
            cancelledAt: true,
            companyContractId: true,
            serviceId: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { startDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  },

  async create(data: CreateStudentContractInput, client: DbClient = prisma) {
    const requestedStatus = data.status ?? 'draft';
    const createRecord = (db: DbClient, status: StudentContractStatus) =>
      db.studentContract.create({
        data: {
          alunoId: data.alunoId,
          contractId: data.contractId,
          serviceId: data.serviceId ?? null,
          status,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          signedAt: data.signedAt ?? null,
          canceledAt: data.canceledAt ?? null,
          cancellationReason: data.cancellationReason ?? null,
          amount: data.amount ?? null,
          paymentDay: data.paymentDay ?? null,
          notes: data.notes ?? null,
        },
      });

    if (requestedStatus !== 'active') {
      return createRecord(client, requestedStatus);
    }

    return runInTransaction(client, async (tx) => {
      const created = await createRecord(tx, 'draft');
      const lifecycle = await prepareOrActivateStudentContractInTransaction(tx, created.id);
      return lifecycle.studentContract;
    });
  },

  async linkExistingContract(
    data: CreateStudentContractInput,
    options: ServiceOperationOptions = {},
    client: DbClient = prisma
  ) {
    const generatedFromTemplate = await generateContractFromActiveTemplate(data, options, client);
    if (generatedFromTemplate) {
      return generatedFromTemplate;
    }

    const generatedContract = await getContractScoped(
      data.contractId,
      options.companyContractId,
      client
    );

    if (generatedContract.alunoId !== data.alunoId) {
      throw new Error('Contrato informado não pertence ao aluno');
    }

    const existing = await client.studentContract.findUnique({
      where: { contractId: data.contractId },
      select: { id: true, alunoId: true },
    });

    if (existing) {
      if (existing.alunoId !== data.alunoId) {
        throw new Error('Contrato já está vinculado a outro aluno');
      }
      throw new Error('Contrato já está vinculado ao aluno');
    }

    const resolvedServiceId = await resolveAuthoritativeFinancialServiceId(
      data.alunoId,
      generatedContract.serviceId,
      options.companyContractId,
      client
    );

    return this.create(
      {
        ...data,
        serviceId: resolvedServiceId,
      },
      client
    );
  },

  async createOrUpdateDraft(data: CreateStudentContractInput, client: DbClient = prisma) {
    const existing = await client.studentContract.findUnique({
      where: { contractId: data.contractId },
      select: { id: true },
    });

    if (existing) {
      return client.studentContract.update({
        where: { id: existing.id },
        data: {
          alunoId: data.alunoId,
          serviceId: data.serviceId ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          amount: data.amount ?? null,
          paymentDay: data.paymentDay ?? null,
          notes: data.notes ?? null,
        },
      });
    }

    return this.create(
      {
        ...data,
        status: data.status ?? 'draft',
      },
      client
    );
  },

  async setStatusByGeneratedContractId(
    generatedContractId: string,
    status: StudentContractStatus,
    options: UpdateStudentContractStatusOptions = {},
    client: DbClient = prisma
  ) {
    if (status === 'active') {
      return runInTransaction(client, async (tx) => {
        const existing = await tx.studentContract.findUnique({
          where: { contractId: generatedContractId },
        });
        if (!existing) return null;

        if (options.startDate !== undefined || options.endDate !== undefined) {
          await tx.studentContract.update({
            where: { id: existing.id },
            data: {
              ...(options.startDate !== undefined ? { startDate: options.startDate } : {}),
              ...(options.endDate !== undefined ? { endDate: options.endDate } : {}),
            },
          });
        }

        const lifecycle = await prepareOrActivateStudentContractInTransaction(tx, existing.id);
        return lifecycle.studentContract;
      });
    }

    const existing = await client.studentContract.findUnique({
      where: { contractId: generatedContractId },
    });

    if (!existing) {
      return null;
    }

    const terminalStatuses: StudentContractStatus[] = ['canceled', 'expired', 'terminated'];
    if (terminalStatuses.includes(existing.status) && existing.status !== status) {
      return existing;
    }

    const updated = await client.studentContract.update({
      where: { id: existing.id },
      data: {
        status,
        startDate: options.startDate !== undefined ? options.startDate : undefined,
        endDate:
          options.endDate !== undefined
            ? options.endDate
            : status === 'canceled' || status === 'expired' || status === 'terminated'
              ? (existing.endDate ?? new Date())
              : undefined,
        signedAt: options.signedAt !== undefined ? options.signedAt : undefined,
        canceledAt:
          options.canceledAt !== undefined
            ? options.canceledAt
            : status === 'canceled'
              ? (existing.canceledAt ?? new Date())
              : undefined,
        cancellationReason:
          options.cancellationReason !== undefined
            ? options.cancellationReason
            : status === 'canceled'
              ? (existing.cancellationReason ?? 'Cancelado a partir da rotina de contratos')
              : undefined,
      },
    });

    await syncAlunoCurrentContract(updated.alunoId, updated.id, status, client);

    return updated;
  },

  async update(
    alunoId: string,
    studentContractId: string,
    data: UpdateStudentContractInput,
    options: ServiceOperationOptions = {},
    client: DbClient = prisma
  ) {
    if (data.status === 'active') {
      return runInTransaction(client, async (tx) => {
        const existing = await assertStudentContractOwnership(
          studentContractId,
          alunoId,
          options.companyContractId,
          tx
        );

        await tx.studentContract.update({
          where: { id: existing.id },
          data: {
            ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
            ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
            ...(data.amount !== undefined ? { amount: data.amount } : {}),
            ...(data.paymentDay !== undefined ? { paymentDay: data.paymentDay } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
        });

        const lifecycle = await prepareOrActivateStudentContractInTransaction(tx, existing.id);
        return lifecycle.studentContract;
      });
    }

    const existing = await assertStudentContractOwnership(
      studentContractId,
      alunoId,
      options.companyContractId,
      client
    );

    const updated = await client.studentContract.update({
      where: { id: existing.id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.signedAt !== undefined ? { signedAt: data.signedAt } : {}),
        ...(data.canceledAt !== undefined ? { canceledAt: data.canceledAt } : {}),
        ...(data.cancellationReason !== undefined
          ? { cancellationReason: data.cancellationReason }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.paymentDay !== undefined ? { paymentDay: data.paymentDay } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    if (data.status !== undefined) {
      await syncAlunoCurrentContract(alunoId, updated.id, data.status, client);
    }

    return updated;
  },

  async activate(
    alunoId: string,
    studentContractId: string,
    options: ServiceOperationOptions = {}
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await assertStudentContractOwnership(
        studentContractId,
        alunoId,
        options.companyContractId,
        tx
      );
      const lifecycle = await prepareOrActivateStudentContractInTransaction(tx, existing.id);
      return lifecycle.studentContract;
    });
  },

  async cancel(
    alunoId: string,
    studentContractId: string,
    reason: string,
    options: ServiceOperationOptions = {},
    client: DbClient = prisma
  ) {
    return runInTransaction(client, async (tx) => {
      const existing = await assertStudentContractOwnership(
        studentContractId,
        alunoId,
        options.companyContractId,
        tx
      );

      const now = new Date();
      const updated = await tx.studentContract.update({
        where: { id: existing.id },
        data: {
          status: 'canceled',
          canceledAt: now,
          endDate: existing.endDate ?? now,
          cancellationReason: reason,
        },
      });

      if (existing.contract.status !== 'SIGNED') {
        await tx.contract.updateMany({
          where: {
            id: existing.contract.id,
            status: { notIn: ['SIGNED', 'CANCELLED', 'EXPIRED'] },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            publicTokenHash: null,
            publicTokenExpiresAt: null,
          },
        });
      }

      await syncAlunoCurrentContract(alunoId, updated.id, 'canceled', tx);

      return updated;
    });
  },
};