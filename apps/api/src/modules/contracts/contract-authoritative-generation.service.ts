import { PrismaClient, Prisma, type Prisma as PrismaTypes } from '@prisma/client';
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
  aluno: { professorId: string },
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

async function loadApplicability(client: DbClient, templateId: string) {
  const rows = await client.$queryRaw<Array<{ applicability: ContractTemplateApplicability }>>(Prisma.sql`
    SELECT "applicability"::text AS "applicability"
    FROM "ContractTemplate"
    WHERE "id" = ${templateId}
    LIMIT 1
  `);
  return rows[0]?.applicability ?? 'STUDENT';
}

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

  const [template, applicability, company, aluno] = await Promise.all([
    client.contractTemplate.findFirst({
      where: {
        id: templateId,
        contractId: companyContractId,
        ...(requireActiveTemplate ? { status: 'ACTIVE' as const } : {}),
      },
      include: { clauses: { orderBy: { order: 'asc' as const } } },
    }),
    loadApplicability(client, templateId),
    client.companyContract.findUnique({ where: { id: companyContractId } }),
    client.aluno.findUnique({
      where: { id: alunoId },
      include: {
        user: { include: { profile: true } },
        professor: { select: { contractId: true } },
      },
    }),
  ]);

  if (!template) {
    throw new Error(requireActiveTemplate
      ? 'Modelo de contrato ativo não encontrado para o contrato autenticado'
      : 'Modelo de contrato não encontrado para o contrato autenticado');
  }
  if (!company) throw new Error('Contrato autenticado não encontrado');
  if (!aluno || aluno.professor.contractId !== companyContractId) {
    throw new Error('Aluno não pertence ao contrato autenticado');
  }

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

  const valorMensal =
    input.valorMensal ??
    (selectedService?.monthlyPrice ? Number(selectedService.monthlyPrice) : undefined);
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
      diaVencimento: input.diaVencimento || '',
      horarios: input.horarios || '',
      dataInicio: formatDate(input.dataInicio),
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
          startDate: toOptionalDate(input.dataInicio),
          endDate: persistence.endDate ?? null,
          amount: input.valorMensal ?? resolved.valorMensal ?? null,
          paymentDay: input.diaVencimento ?? null,
          notes: input.horarios ?? null,
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
