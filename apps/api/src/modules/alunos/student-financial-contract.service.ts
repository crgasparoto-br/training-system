import { PrismaClient, type Prisma } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';
import { legacyDirectActiveStudentCreationFields } from './student-lifecycle.service.js';
import { upsertStudentIdentity } from './student-identity.service.js';
import {
  hasCanonicalHealthIntakeMutation,
  upsertCanonicalStudentHealthIntake,
} from './student-health-intake-write.service.js';
import type { CreateAlunoDTO, UpdateAlunoDTO } from './aluno.service.js';
import { contractDocumentService } from '../contracts/contract-document.service.js';
import { loadContractServiceVariableContext } from '../contracts/contract-service-context.js';
import { parseActiveContractTemplateReference } from '../student-contracts/student-contract-reference.js';
import { assertNoLegacyParqWrite } from './student-parq-legacy-cutover.js';
import { prepareOrActivateStudentContractInTransaction } from '../student-contracts/student-contract-lifecycle-transaction.js';

const prisma = new PrismaClient();

type DbClient = Prisma.TransactionClient;

export type StudentFinancialContractInput = {
  contractId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  amount?: number | Prisma.Decimal | null;
  paymentDay?: number | null;
  notes?: string | null;
};

export type StudentFinancialContractOperationOptions = {
  professorId: string;
  companyContractId: string;
};

const alunoInclude = {
  user: { include: { profile: true } },
  professor: { include: { user: { include: { profile: true } } } },
  service: true,
  macronutrients: true,
  intakeForm: true,
} satisfies Prisma.AlunoInclude;

const studentContractInclude = {
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
} satisfies Prisma.StudentContractInclude;

const hasAnyValue = (payload: Record<string, unknown>) =>
  Object.values(payload).some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(
        (nested) =>
          nested === true ||
          nested === false ||
          (nested !== undefined && nested !== null && nested !== '')
      );
    }
    return true;
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * currentService is a denormalized read model. During the atomic mutation the
 * client may update the remaining financial form fields, but only the
 * StudentContract synchronization is allowed to write the current service.
 */
export const preserveAuthoritativeFinancialCurrentService = (
  formResponses?: Record<string, unknown>,
  persistedCurrentService?: string
) => {
  if (!formResponses) return undefined;

  const normalized: Record<string, unknown> = { ...formResponses };
  const financial = asRecord(normalized.financial);
  if (!financial) return normalized;

  const normalizedFinancial: Record<string, unknown> = { ...financial };
  delete normalizedFinancial.currentService;
  if (persistedCurrentService !== undefined) {
    normalizedFinancial.currentService = persistedCurrentService;
  }
  normalized.financial = normalizedFinancial;
  return normalized;
};

const getResponsibleProfessorIdFromFormResponses = (
  formResponses?: Record<string, unknown>
) => {
  if (!formResponses) return undefined;
  const financial = formResponses.financial;
  if (!financial || typeof financial !== 'object') return undefined;
  const value = (financial as Record<string, unknown>).responsibleProfessorId;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const loadInterestService = async (
  tx: DbClient,
  companyContractId: string,
  serviceId: string,
  currentServiceId?: string | null
) => {
  const service = await tx.serviceOption.findFirst({
    where: { id: serviceId, contractId: companyContractId },
    select: { id: true, isActive: true, parentServiceId: true },
  });
  if (!service) throw new Error('Serviço selecionado não pertence ao contrato');
  assertStudentInterestServiceSelectable(service, currentServiceId);
  return service;
};

const createAlunoRecord = async (
  tx: DbClient,
  data: CreateAlunoDTO,
  options: StudentFinancialContractOperationOptions,
  passwordHash: string
) => {
  const existingUser = await tx.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new Error('Email já está registrado');

  const professor = await tx.professor.findFirst({
    where: { id: options.professorId, contractId: options.companyContractId },
    select: { id: true, contractId: true },
  });
  if (!professor) throw new Error('Professor não encontrado para este contrato');

  let serviceId: string | undefined;
  if (data.serviceId) {
    serviceId = (
      await loadInterestService(tx, options.companyContractId, data.serviceId)
    ).id;
  }

  const user = await tx.user.create({
    data: {
      email: data.email,
      passwordHash,
      type: 'aluno',
      profile: {
        create: {
          name: data.name,
          avatar: data.avatar,
          phone: data.phone,
          birthDate: data.birthDate,
          gender: data.gender,
        },
      },
    },
  });

  const aluno = await tx.aluno.create({
    data: {
      userId: user.id,
      professorId: options.professorId,
      // Fluxo comercial legado: aluno já nasce ativo, com conta e professor
      // completos (issue #268 não altera este fluxo).
      contractId: professor.contractId,
      ...legacyDirectActiveStudentCreationFields(),
      serviceId,
      schedulePlan: data.schedulePlan,
      age: data.age,
      weight: data.weight,
      height: data.height,
      bodyFatPercentage: data.bodyFatPercentage,
      vo2Max: data.vo2Max,
      anaerobicThreshold: data.anaerobicThreshold,
      maxHeartRate: data.maxHeartRate,
      restingHeartRate: data.restingHeartRate,
      systolicPressure: data.systolicPressure,
      diastolicPressure: data.diastolicPressure,
    },
  });

  await upsertStudentIdentity(
    aluno.id,
    options.companyContractId,
    {
      name: data.name,
      email: data.email,
      phone: data.phone,
      birthDate: data.birthDate,
      gender: data.gender,
    },
    {
      client: tx,
      sourceType: 'professional',
      sourceReference: 'financial_contract_create',
      syncLegacyProfile: true,
    }
  );

  if (data.macronutrients && hasAnyValue(data.macronutrients)) {
    await tx.macronutrients.create({
      data: {
        alunoId: aluno.id,
        carbohydratesPercentage: data.macronutrients.carbohydratesPercentage ?? 0,
        proteinsPercentage: data.macronutrients.proteinsPercentage ?? 0,
        lipidsPercentage: data.macronutrients.lipidsPercentage ?? 0,
        dailyCalories: data.macronutrients.dailyCalories,
      },
    });
  }

  if (data.intakeForm) {
    if (hasCanonicalHealthIntakeMutation(data.intakeForm)) {
      await upsertCanonicalStudentHealthIntake(tx, {
        alunoId: aluno.id,
        contractId: options.companyContractId,
        sourceType: 'professional',
        sourceReference: 'financial_contract_create',
        health: data.intakeForm,
      });
    }
  }

  if (data.intakeForm?.assessmentDate) {
    await tx.progressMetric.create({
      data: {
        alunoId: aluno.id,
        date: data.intakeForm.assessmentDate,
        weight: data.weight,
        bodyFatPercentage: data.bodyFatPercentage,
        vo2MaxEstimated: data.vo2Max,
        notes: data.intakeForm.observations,
      },
    });
  }

  return aluno.id;
};

const updateAlunoRecord = async (
  tx: DbClient,
  alunoId: string,
  data: UpdateAlunoDTO,
  options: StudentFinancialContractOperationOptions
) => {
  const {
    avatar,
    professorId,
    birthDate,
    gender,
    macronutrients,
    intakeForm,
    ...alunoPatch
  } = data;
  const alunoData: Prisma.AlunoUncheckedUpdateInput = { ...alunoPatch };

  const currentAluno = await tx.aluno.findUniqueOrThrow({
    where: { id: alunoId },
    include: {
      currentStudentContract: {
        select: { contract: { select: { companyContractId: true } } },
      },
      intakeForm: { select: { parqResponses: true } },
    },
  });

  // Issue #268: Aluno.contractId é a barreira tenant-scoped canônica.
  const scopedContractId = currentAluno.contractId;
  if (scopedContractId !== options.companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }

  if (data.serviceId !== undefined) {
    if (!data.serviceId) {
      alunoData.serviceId = null as never;
    } else {
      alunoData.serviceId = (
        await loadInterestService(
          tx,
          options.companyContractId,
          data.serviceId,
          currentAluno.serviceId
        )
      ).id as never;
    }
  }

  const desiredProfessorId =
    professorId || getResponsibleProfessorIdFromFormResponses(intakeForm?.formResponses);
  if (desiredProfessorId && desiredProfessorId !== currentAluno.professorId) {
    const targetProfessor = await tx.professor.findFirst({
      where: { id: desiredProfessorId, contractId: options.companyContractId },
      select: { id: true },
    });
    if (!targetProfessor) {
      throw new Error('Professor responsável inválido para este contrato');
    }
    alunoData.professorId = targetProfessor.id as never;
  }

  const aluno = await tx.aluno.update({ where: { id: alunoId }, data: alunoData });

  if (birthDate !== undefined || gender !== undefined) {
    await upsertStudentIdentity(
      aluno.id,
      options.companyContractId,
      {
        ...(birthDate !== undefined ? { birthDate } : {}),
        ...(gender !== undefined ? { gender } : {}),
      },
      {
        client: tx,
        sourceType: 'professional',
        sourceReference: 'financial_contract_update',
        syncLegacyProfile: true,
      }
    );
  }

  if (aluno.userId && avatar !== undefined) {
    await tx.profile.update({ where: { userId: aluno.userId }, data: { avatar } });
  }

  if (macronutrients && hasAnyValue(macronutrients)) {
    await tx.macronutrients.upsert({
      where: { alunoId },
      create: {
        alunoId,
        carbohydratesPercentage: macronutrients.carbohydratesPercentage ?? 0,
        proteinsPercentage: macronutrients.proteinsPercentage ?? 0,
        lipidsPercentage: macronutrients.lipidsPercentage ?? 0,
        dailyCalories: macronutrients.dailyCalories,
      },
      update: {
        carbohydratesPercentage: macronutrients.carbohydratesPercentage ?? 0,
        proteinsPercentage: macronutrients.proteinsPercentage ?? 0,
        lipidsPercentage: macronutrients.lipidsPercentage ?? 0,
        dailyCalories: macronutrients.dailyCalories,
      },
    });
  }

  if (intakeForm) {
    if (hasCanonicalHealthIntakeMutation(intakeForm)) {
      await upsertCanonicalStudentHealthIntake(tx, {
        alunoId,
        contractId: options.companyContractId,
        sourceType: 'professional',
        sourceReference: 'financial_contract_update',
        health: intakeForm,
      });
    }
    }
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const normalizeDocument = (value?: string | null) => value?.replace(/\D/gu, '') || '';
const formatDate = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};
const formatAddress = (profile?: Record<string, unknown> | null) =>
  [
    [profile?.addressStreet, profile?.addressNumber].filter(Boolean).join(', '),
    profile?.addressComplement,
    profile?.addressNeighborhood,
    [profile?.addressCity, profile?.addressState].filter(Boolean).join(' - '),
    profile?.addressZipCode,
  ]
    .filter(Boolean)
    .join(', ');
const amountToWords = (value?: number | null) =>
  value === undefined || value === null || Number.isNaN(value)
    ? ''
    : `${currency.format(value)} reais`;
const documentHash = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

const loadScopedFinancialService = async (
  tx: DbClient,
  companyContractId: string,
  serviceId?: string | null
) => {
  const normalizedServiceId = serviceId?.trim() || null;
  if (!normalizedServiceId) return null;

  const service = await tx.serviceOption.findFirst({
    where: { id: normalizedServiceId, contractId: companyContractId },
  });
  if (!service) {
    throw new Error('Serviço financeiro do contrato não pertence ao contrato autenticado');
  }
  return service;
};

const buildTemplateContext = async (
  tx: DbClient,
  companyContractId: string,
  input: {
    alunoId: string;
    serviceId?: string | null;
    professorId?: string;
    amount?: number;
    paymentDay?: number | null;
    notes?: string | null;
    startDate?: Date | null;
  }
) => {
  const [company, aluno] = await Promise.all([
    tx.companyContract.findUniqueOrThrow({ where: { id: companyContractId } }),
    tx.aluno.findUniqueOrThrow({
      where: { id: input.alunoId },
      include: { user: { include: { profile: true } } },
    }),
  ]);

  if (!aluno.user) {
    throw new Error(
      'Aluno ainda não possui conta vinculada; não é possível gerar contrato financeiro para um registro incompleto (lead)'
    );
  }

  const selectedService = await loadScopedFinancialService(
    tx,
    companyContractId,
    input.serviceId ?? aluno.serviceId
  );
  const professorId = input.professorId || aluno.professorId;
  const professor = professorId
    ? await tx.professor.findFirst({
        where: { id: professorId, contractId: companyContractId },
        include: { user: { include: { profile: true } } },
      })
    : null;
  const amount = input.amount ?? selectedService?.monthlyPrice ?? undefined;
  const numericAmount = amount === undefined || amount === null ? undefined : Number(amount);
  const serviceContext = await loadContractServiceVariableContext(
    tx as unknown as PrismaClient,
    companyContractId,
    selectedService,
    numericAmount
  );
  const profile = aluno.user.profile as unknown as Record<string, unknown>;
  const companyProfile = company as unknown as Record<string, unknown>;

  return {
    aluno: {
      nome: aluno.user.profile?.name || '',
      cpf: normalizeDocument(aluno.user.profile?.cpf),
      rg: aluno.user.profile?.rg || '',
      enderecoCompleto: formatAddress(profile),
    },
    responsavel: {
      nome: aluno.user.profile?.name || '',
      cpf: normalizeDocument(aluno.user.profile?.cpf),
      email: aluno.user.email,
    },
    empresa: {
      razaoSocial: company.name || '',
      cnpj: normalizeDocument(company.document),
      cref: company.cref || '',
      endereco: formatAddress(companyProfile),
    },
    servico: serviceContext,
    professor: {
      id: professor?.id || '',
      nome: professor?.user.profile?.name || '',
      cref: professor?.user.profile?.cref || '',
    },
    contrato: {
      valorMensal: numericAmount !== undefined ? currency.format(numericAmount) : '',
      valorMensalExtenso: amountToWords(numericAmount),
      diaVencimento: input.paymentDay || '',
      horarios: input.notes || '',
      dataInicio: formatDate(input.startDate),
      dataAssinatura: formatDate(new Date()),
    },
  };
};

const resolveContractDocument = async (
  tx: DbClient,
  alunoId: string,
  contractInput: StudentFinancialContractInput,
  options: StudentFinancialContractOperationOptions
) => {
  const templateId = parseActiveContractTemplateReference(contractInput.contractId);
  if (!templateId) {
    const contract = await tx.contract.findUnique({
      where: { id: contractInput.contractId },
      select: {
        id: true,
        alunoId: true,
        companyContractId: true,
        serviceId: true,
      },
    });
    if (!contract) throw new Error('Contrato selecionado não encontrado');
    if (contract.companyContractId !== options.companyContractId) {
      throw new Error('Contrato selecionado está fora do contrato autenticado');
    }
    if (contract.alunoId !== alunoId) {
      throw new Error('Contrato selecionado não pertence ao aluno');
    }
    return contract;
  }

  const template = await tx.contractTemplate.findFirst({
    where: {
      id: templateId,
      contractId: options.companyContractId,
      status: 'ACTIVE',
    },
    include: { clauses: { orderBy: { order: 'asc' } } },
  });
  if (!template) throw new Error('Modelo de contrato ativo não encontrado');

  const authoritativeServiceId = template.serviceId ?? null;
  const context = await buildTemplateContext(tx, options.companyContractId, {
    alunoId,
    serviceId: authoritativeServiceId,
    professorId: options.professorId,
    amount:
      contractInput.amount === null || contractInput.amount === undefined
        ? undefined
        : Number(contractInput.amount),
    paymentDay: contractInput.paymentDay,
    notes: contractInput.notes,
    startDate: contractInput.startDate,
  });
  const renderedHtml = contractDocumentService.renderTemplate(template, context);
  const created = await tx.contract.create({
    data: {
      companyContractId: options.companyContractId,
      templateId: template.id,
      templateVersion: template.version,
      alunoId,
      serviceId: authoritativeServiceId,
      professorId: options.professorId,
      status: 'GENERATED',
      title: template.name,
      renderedHtml,
      dataSnapshot: context as Prisma.InputJsonObject,
      documentHash: documentHash(renderedHtml),
    },
    select: {
      id: true,
      alunoId: true,
      companyContractId: true,
      serviceId: true,
    },
  });
  await tx.contractAuditLog.create({
    data: {
      contractId: created.id,
      action: 'GENERATED' as never,
      details: { templateId: template.id } as Prisma.InputJsonValue,
    },
  });
  return created;
};

export const resolveAuthoritativeStudentContractServiceId = (
  contractServiceId?: string | null,
  persistedAlunoServiceId?: string | null
) => contractServiceId?.trim() || persistedAlunoServiceId?.trim() || null;

const loadAuthoritativeStudentContractServiceId = async (
  tx: DbClient,
  alunoId: string,
  companyContractId: string,
  contractServiceId?: string | null
) => {
  const aluno = await tx.aluno.findUniqueOrThrow({
    where: { id: alunoId },
    select: {
      serviceId: true,
      contractId: true,
    },
  });
  // Issue #268: contractId direto em Aluno evita depender de professor
  // estar vinculado.
  if (aluno.contractId !== companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }

  const serviceId = resolveAuthoritativeStudentContractServiceId(
    contractServiceId,
    aluno.serviceId
  );
  if (!serviceId) return null;

  const service = await tx.serviceOption.findFirst({
    where: { id: serviceId, contractId: companyContractId },
    select: { id: true },
  });
  if (!service) {
    throw new Error('Serviço financeiro do contrato não pertence ao contrato autenticado');
  }
  return service.id;
};

const persistStudentContractWithLifecycle = async (
  tx: DbClient,
  alunoId: string,
  contractInput: StudentFinancialContractInput,
  options: StudentFinancialContractOperationOptions
) => {
  const contract = await resolveContractDocument(tx, alunoId, contractInput, options);
  const serviceId = await loadAuthoritativeStudentContractServiceId(
    tx,
    alunoId,
    options.companyContractId,
    contract.serviceId
  );
  const existing = await tx.studentContract.findUnique({
    where: { contractId: contract.id },
  });
  if (existing && existing.alunoId !== alunoId) {
    throw new Error('Contrato selecionado já está vinculado a outro aluno');
  }

  const mutableData = {
    serviceId,
    startDate: contractInput.startDate ?? null,
    endDate: contractInput.endDate ?? null,
    amount: contractInput.amount ?? null,
    paymentDay: contractInput.paymentDay ?? null,
    notes: contractInput.notes ?? null,
  };
  const link = existing
    ? await tx.studentContract.update({
        where: { id: existing.id },
        data: mutableData,
      })
    : await tx.studentContract.create({
        data: {
          alunoId,
          contractId: contract.id,
          status: 'draft',
          ...mutableData,
        },
      });

  await prepareOrActivateStudentContractInTransaction(tx, link.id);

  return tx.studentContract.findUniqueOrThrow({
    where: { id: link.id },
    include: studentContractInclude,
  });
};

export const studentFinancialContractService = {
  async createAlunoWithContract(
    data: CreateAlunoDTO,
    contractInput: StudentFinancialContractInput,
    options: StudentFinancialContractOperationOptions
  ) {
    assertNoLegacyParqWrite(data);
    const tempPassword = `temp-${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    return prisma.$transaction(async (tx) => {
      const alunoId = await createAlunoRecord(tx, data, options, passwordHash);
      const studentContract = await persistStudentContractWithLifecycle(
        tx,
        alunoId,
        contractInput,
        options
      );
      const aluno = await tx.aluno.findUniqueOrThrow({
        where: { id: alunoId },
        include: alunoInclude,
      });
      return { aluno, tempPassword, studentContract };
    });
  },

  async updateAlunoWithContract(
    alunoId: string,
    data: UpdateAlunoDTO,
    contractInput: StudentFinancialContractInput,
    options: StudentFinancialContractOperationOptions
  ) {
    assertNoLegacyParqWrite(data);
    return prisma.$transaction(async (tx) => {
      await updateAlunoRecord(tx, alunoId, data, options);
      const studentContract = await persistStudentContractWithLifecycle(
        tx,
        alunoId,
        contractInput,
        options
      );
      const aluno = await tx.aluno.findUniqueOrThrow({
        where: { id: alunoId },
        include: alunoInclude,
      });
      return { aluno, studentContract };
    });
  },
};
