import { PrismaClient, type Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import crypto from 'crypto';
import { contractDocumentService } from './contract-document.service.js';
import { loadContractServiceVariableContext } from './contract-service-context.js';
import { prepareOrActivateStudentContractInTransaction } from '../student-contracts/student-contract-lifecycle-transaction.js';
import {
  assertTemplateSupportsParty,
  assertTemplateVariablesCompatible,
  assertUsedContractVariablesFilled,
  type ContractTemplateApplicability,
} from './contract-variable-definitions.js';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;
type ContractGenerationInput = Parameters<typeof contractDocumentService.generate>[1];
type BaseActor = NonNullable<Parameters<typeof contractDocumentService.generate>[2]>;

export type ContractGenerationActor = BaseActor & {
  professorId?: string;
  professorRole?: string;
};

export type ContractGenerationPersistenceOptions = {
  endDate?: Date | null;
  requestedStatus?: 'draft' | 'active';
};

const normalizeDocument = (value?: string | null) => value?.replace(/\D/gu, '') || '';
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

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

const toFiniteNumber = (value: unknown) => {
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const numericValue = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
};

const toOptionalDate = (value?: string | Date | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const documentHash = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

async function runInTransaction<T>(
  client: DbClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const prismaClient = client as PrismaClient;
  if (typeof prismaClient.$transaction === 'function') return prismaClient.$transaction(work);
  return work(client as Prisma.TransactionClient);
}

const isDbClient = (value: ContractGenerationActor | DbClient | undefined): value is DbClient =>
  Boolean(value && typeof value === 'object' && ('contractTemplate' in value || '$transaction' in value));

const assertActorCanAccessAluno = (
  aluno: { professorId: string | null },
  actor?: ContractGenerationActor
) => {
  if (!actor?.professorId || actor.professorRole === 'master') return;
  if (aluno.professorId !== actor.professorId) {
    throw new Error('Aluno fora do escopo do professor autenticado');
  }
};

const assertActorCanAssignProfessor = (
  professorId: string | null,
  actor?: ContractGenerationActor
) => {
  if (!actor?.professorId || actor.professorRole === 'master' || !professorId) return;
  if (professorId !== actor.professorId) {
    throw new Error('Professor responsável fora do escopo do professor autenticado');
  }
};


async function resolveGenerationData(
  client: DbClient,
  companyContractId: string,
  input: ContractGenerationInput,
  requireActiveTemplate: boolean,
  actor?: ContractGenerationActor
) {
  const templateId = String(input.templateId || '').trim();
  const alunoId = String(input.alunoId || '').trim();
  if (!templateId) throw new Error('Informe o modelo de contrato');
  if (!alunoId) throw new Error('Informe o aluno do contrato');

  const [template, company, aluno] = await Promise.all([
    client.contractTemplate.findFirst({
      where: {
        id: templateId,
        contractId: companyContractId,
        ...(requireActiveTemplate ? { status: 'ACTIVE' as const } : {}),
      },
      include: { clauses: { orderBy: { order: 'asc' as const } } },
    }),
    client.companyContract.findUnique({ where: { id: companyContractId } }),
    client.aluno.findUnique({
      where: { id: alunoId },
      include: {
        user: { include: { profile: true } },
        professor: { select: { contractId: true } },
        studentFinancialProfile: true,
        currentStudentContract: {
          select: {
            status: true,
            amount: true,
            paymentDay: true,
            notes: true,
            startDate: true,
          },
        },
        studentContracts: {
          where: { status: 'active' as const },
          select: {
            status: true,
            amount: true,
            paymentDay: true,
            notes: true,
            startDate: true,
          },
          orderBy: { updatedAt: 'desc' as const },
          take: 1,
        },
      },
    }),
  ]);

  if (!template) {
    throw new Error(requireActiveTemplate
      ? 'Modelo de contrato ativo não encontrado para o contrato autenticado'
      : 'Modelo de contrato não encontrado para o contrato autenticado');
  }
  if (!company) throw new Error('Contrato autenticado não encontrado');
  // Issue #268: contractId direto em Aluno é a fonte tenant-scoped correta.
  if (!aluno || aluno.contractId !== companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }
  if (!aluno.user) {
    throw new Error(
      'Aluno ainda não possui conta vinculada; não é possível gerar contrato para um registro incompleto (lead)'
    );
  }

  const applicability: ContractTemplateApplicability = template.applicability ?? 'STUDENT';
  assertTemplateSupportsParty(applicability, 'STUDENT');
  const usedVariables = assertTemplateVariablesCompatible(applicability, [
    template.headerHtml,
    template.footerHtml,
    ...template.clauses.map((clause) => clause.bodyHtml),
  ]);
  assertActorCanAccessAluno(aluno, actor);

  const documentServiceId = template.serviceId?.trim() || null;
  const effectiveServiceId = documentServiceId || aluno.serviceId?.trim() || null;
  const selectedService = effectiveServiceId
    ? await client.serviceOption.findFirst({
        where: { id: effectiveServiceId, contractId: companyContractId },
      })
    : null;
  if (effectiveServiceId && !selectedService) {
    throw new Error('Serviço financeiro do contrato não pertence ao contrato autenticado');
  }

  const requestedProfessorId =
    typeof input.professorId === 'string' ? input.professorId.trim() : '';
  const professorId = requestedProfessorId || aluno.professorId;
  assertActorCanAssignProfessor(professorId || null, actor);
  const professor = professorId
    ? await client.professor.findFirst({
        where: { id: professorId, contractId: companyContractId },
        include: { user: { include: { profile: true } } },
      })
    : null;
  if (professorId && !professor) {
    throw new Error('Professor responsável não pertence ao contrato autenticado');
  }

  const financialProfile =
    aluno.studentFinancialProfile?.contractId === companyContractId
      ? aluno.studentFinancialProfile
      : null;
  const activeStudentContract =
    aluno.currentStudentContract?.status === 'active'
      ? aluno.currentStudentContract
      : (aluno.studentContracts[0] ?? null);

  // Preview and real generation intentionally share this exact resolution.
  // Explicit generation input wins; otherwise use the persisted financial
  // profile, then the active contract, and only then the commercial catalog.
  const valorMensal =
    input.valorMensal ??
    toFiniteNumber(financialProfile?.monthlyAmount) ??
    toFiniteNumber(activeStudentContract?.amount) ??
    toFiniteNumber(selectedService?.monthlyPrice);
  const diaVencimento =
    input.diaVencimento ??
    financialProfile?.paymentDay ??
    activeStudentContract?.paymentDay ??
    undefined;
  const horarios =
    input.horarios ??
    financialProfile?.notes ??
    activeStudentContract?.notes ??
    undefined;
  const dataInicio =
    input.dataInicio ??
    financialProfile?.contractStartDate ??
    activeStudentContract?.startDate ??
    undefined;

  const serviceContext = await loadContractServiceVariableContext(
    client as PrismaClient,
    companyContractId,
    selectedService,
    valorMensal
  );
  const profile = aluno.user.profile as unknown as Record<string, unknown> | null;
  const companyProfile = company as unknown as Record<string, unknown>;

  const context = {
    aluno: {
      nome: aluno.user.profile?.name || '',
      cpf: normalizeDocument(aluno.user.profile?.cpf),
      rg: aluno.user.profile?.rg || '',
      enderecoCompleto: formatAddress(profile),
    },
    responsavel: {
      nome: input.responsavel?.nome || aluno.user.profile?.name || '',
      cpf: normalizeDocument(input.responsavel?.cpf || aluno.user.profile?.cpf),
      email: input.responsavel?.email || aluno.user.email,
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
      valorMensal: valorMensal !== undefined ? currency.format(valorMensal) : '',
      valorMensalExtenso: amountToWords(valorMensal),
      diaVencimento: diaVencimento ?? '',
      horarios: horarios ?? '',
      dataInicio: formatDate(dataInicio),
      dataAssinatura: formatDate(input.dataAssinatura || new Date()),
    },
  };

  assertUsedContractVariablesFilled(usedVariables, context);

  return {
    template,
    applicability,
    alunoId,
    professorId: professor?.id || null,
    documentServiceId,
    effectiveServiceId,
    valorMensal,
    resolvedContractValues: {
      diaVencimento,
      horarios,
      dataInicio,
    },
    context,
  };
}

export const contractAuthoritativeGenerationService = {
  async preview(
    companyContractId: string,
    input: ContractGenerationInput,
    actorOrClient?: ContractGenerationActor | DbClient,
    client: DbClient = prisma
  ) {
    const actor = isDbClient(actorOrClient) ? undefined : actorOrClient;
    const dbClient = isDbClient(actorOrClient) ? actorOrClient : client;
    const resolved = await resolveGenerationData(
      dbClient,
      companyContractId,
      input,
      false,
      actor
    );
    return {
      html: contractDocumentService.renderTemplate(resolved.template, resolved.context),
      context: resolved.context,
      party: { type: 'STUDENT' as const, id: resolved.alunoId },
    };
  },

  async generate(
    companyContractId: string,
    input: ContractGenerationInput,
    actor?: ContractGenerationActor,
    client: DbClient = prisma,
    persistence: ContractGenerationPersistenceOptions = {}
  ) {
    return runInTransaction(client, async (tx) => {
      const resolved = await resolveGenerationData(
        tx,
        companyContractId,
        input,
        true,
        actor
      );
      const renderedHtml = contractDocumentService.renderTemplate(
        resolved.template,
        resolved.context
      );
      const snapshot = {
        party: { type: 'STUDENT', id: resolved.alunoId },
        values: resolved.context,
      } as PrismaTypes.InputJsonObject;

      const created = await tx.contract.create({
        data: {
          companyContractId,
          templateId: resolved.template.id,
          templateVersion: resolved.template.version,
          alunoId: resolved.alunoId,
          responsavelName: input.responsavel?.nome || null,
          responsavelCpf: input.responsavel?.cpf || null,
          responsavelEmail: input.responsavel?.email || null,
          serviceId: resolved.documentServiceId,
          professorId: resolved.professorId,
          status: 'GENERATED',
          title: resolved.template.name,
          renderedHtml,
          dataSnapshot: snapshot,
          documentHash: documentHash(renderedHtml),
        },
      });

      const link = await tx.studentContract.create({
        data: {
          alunoId: resolved.alunoId,
          contractId: created.id,
          serviceId: resolved.effectiveServiceId,
          status: 'draft',
          startDate: toOptionalDate(resolved.resolvedContractValues.dataInicio),
          endDate: persistence.endDate ?? null,
          amount: input.valorMensal ?? resolved.valorMensal ?? null,
          paymentDay: resolved.resolvedContractValues.diaVencimento ?? null,
          notes: resolved.resolvedContractValues.horarios ?? null,
        },
      });

      if (persistence.requestedStatus === 'active') {
        await prepareOrActivateStudentContractInTransaction(tx, link.id);
      }

      await tx.contractAuditLog.create({
        data: {
          contractId: created.id,
          actorUserId: actor?.userId,
          action: 'GENERATED' as never,
          ipAddress: actor?.ipAddress,
          userAgent: actor?.userAgent,
          details: {
            templateId: resolved.template.id,
            partyType: 'STUDENT',
            partyId: resolved.alunoId,
          },
        },
      });

      return created;
    });
  },
};
