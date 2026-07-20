import crypto from 'crypto';
import { Prisma, PrismaClient, type Prisma as PrismaTypes } from '@prisma/client';
import { contractDocumentService } from './contract-document.service.js';
import {
  assertTemplateSupportsParty,
  assertTemplateVariablesCompatible,
  assertUsedContractVariablesFilled,
  type ContractTemplateApplicability,
} from './contract-variable-definitions.js';

const prisma = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;

export type CollaboratorContractInput = {
  templateId: string;
  collaboratorId: string;
  valorMensal?: number;
  diaVencimento?: number;
  horarios?: string;
  dataInicio?: string | Date;
  dataAssinatura?: string | Date;
  notes?: string;
};

export type ContractActor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type TemplateRow = {
  id: string;
  contractId: string;
  name: string;
  description: string | null;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  applicability: ContractTemplateApplicability;
  headerHtml: string;
  footerHtml: string;
};

type ClauseRow = {
  id: string;
  order: number;
  title: string;
  bodyHtml: string;
  required: boolean;
  editable: boolean;
};

export type CollaboratorContractView = {
  id: string;
  collaboratorId: string;
  contractId: string | null;
  status: string;
  origin: 'ELECTRONIC' | 'LEGACY_PDF' | 'LEGACY_DECLARATION';
  startDate: Date | null;
  endDate: Date | null;
  signedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  notes: string | null;
  legacyDocumentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  documentTitle: string | null;
  documentStatus: string | null;
  renderedHtml: string | null;
  pdfPath: string | null;
  publicTokenExpiresAt: Date | null;
  documentCreatedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
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

const toOptionalDate = (value?: string | Date | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const hashDocument = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

async function loadTemplate(
  client: DbClient,
  companyContractId: string,
  templateId: string,
  requireActive: boolean
) {
  const templates = await client.$queryRaw<TemplateRow[]>(Prisma.sql`
    SELECT
      "id",
      "contractId",
      "name",
      "description",
      "version",
      "status"::text AS "status",
      "applicability"::text AS "applicability",
      "headerHtml",
      "footerHtml"
    FROM "ContractTemplate"
    WHERE "id" = ${templateId}
      AND "contractId" = ${companyContractId}
      ${requireActive ? Prisma.sql`AND "status" = 'ACTIVE'::"ContractTemplateStatus"` : Prisma.empty}
    LIMIT 1
  `);
  const template = templates[0];
  if (!template) {
    throw new Error(requireActive
      ? 'Modelo de contrato ativo não encontrado para o contrato autenticado'
      : 'Modelo de contrato não encontrado para o contrato autenticado');
  }

  const clauses = await client.$queryRaw<ClauseRow[]>(Prisma.sql`
    SELECT "id", "order", "title", "bodyHtml", "required", "editable"
    FROM "ContractTemplateClause"
    WHERE "templateId" = ${template.id}
    ORDER BY "order" ASC
  `);
  return { ...template, clauses };
}

async function resolveContext(
  client: DbClient,
  companyContractId: string,
  input: CollaboratorContractInput,
  requireActiveTemplate: boolean
) {
  const templateId = String(input.templateId || '').trim();
  const collaboratorId = String(input.collaboratorId || '').trim();
  if (!templateId) throw new Error('Informe o modelo de contrato');
  if (!collaboratorId) throw new Error('Informe o colaborador do contrato');

  const [template, company, collaborator] = await Promise.all([
    loadTemplate(client, companyContractId, templateId, requireActiveTemplate),
    client.companyContract.findUnique({ where: { id: companyContractId } }),
    client.professor.findFirst({
      where: { id: collaboratorId, contractId: companyContractId },
      include: {
        user: { include: { profile: true } },
        collaboratorFunction: true,
        responsibleManager: { include: { user: { include: { profile: true } } } },
      },
    }),
  ]);

  if (!company) throw new Error('Contrato autenticado não encontrado');
  if (!collaborator) throw new Error('Colaborador não pertence ao contrato autenticado');

  assertTemplateSupportsParty(template.applicability, 'COLLABORATOR');
  const usedVariables = assertTemplateVariablesCompatible(template.applicability, [
    template.headerHtml,
    template.footerHtml,
    ...template.clauses.map((clause) => clause.bodyHtml),
  ]);

  const profile = collaborator.user.profile as unknown as Record<string, unknown> | null;
  const companyProfile = company as unknown as Record<string, unknown>;
  const valorMensal = input.valorMensal;
  const context = {
    colaborador: {
      nome: collaborator.user.profile?.name || '',
      cpf: normalizeDocument(collaborator.user.profile?.cpf),
      rg: collaborator.user.profile?.rg || '',
      enderecoCompleto: formatAddress(profile),
      email: collaborator.user.email || '',
      telefone: collaborator.user.profile?.phone || '',
      funcao: collaborator.collaboratorFunction?.name || '',
      cref: collaborator.user.profile?.cref || '',
      resumoProfissional: collaborator.user.profile?.professionalSummary || '',
      documentoEmpresa: collaborator.user.profile?.companyDocument || '',
      gestorResponsavel: collaborator.responsibleManager?.user.profile?.name || '',
      dataAdmissao: formatDate(collaborator.admissionDate),
      dataDesligamento: formatDate(collaborator.dismissalDate),
      situacao: collaborator.currentStatus || (collaborator.user.isActive ? 'Ativo' : 'Desligado'),
    },
    empresa: {
      razaoSocial: company.name || '',
      cnpj: normalizeDocument(company.document),
      cref: company.cref || '',
      endereco: formatAddress(companyProfile),
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
  return { template, collaborator, context };
}

async function listRows(
  client: DbClient,
  companyContractId: string,
  collaboratorId: string
) {
  return client.$queryRaw<CollaboratorContractView[]>(Prisma.sql`
    SELECT
      cc."id",
      cc."collaboratorId",
      cc."contractId",
      cc."status"::text AS "status",
      cc."origin"::text AS "origin",
      cc."startDate",
      cc."endDate",
      cc."signedAt",
      cc."canceledAt",
      cc."cancellationReason",
      cc."notes",
      cc."legacyDocumentUrl",
      cc."createdAt",
      cc."updatedAt",
      gc."title" AS "documentTitle",
      gc."status"::text AS "documentStatus",
      gc."renderedHtml",
      gc."pdfPath",
      gc."publicTokenExpiresAt",
      gc."createdAt" AS "documentCreatedAt",
      rejection."rejectedAt",
      rejection."rejectionReason"
    FROM "CollaboratorContract" cc
    JOIN "Professor" p ON p."id" = cc."collaboratorId"
    LEFT JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
    LEFT JOIN LATERAL (
      SELECT
        NULLIF(log."details" ->> 'rejectedAt', '')::timestamptz AS "rejectedAt",
        NULLIF(log."details" ->> 'rejectionReason', '') AS "rejectionReason"
      FROM "ContractAuditLog" log
      WHERE log."contractId" = gc."id"
        AND log."action" = 'UPDATED'::"ContractAuditAction"
        AND log."details" ->> 'kind' = 'STUDENT_REJECTION'
      ORDER BY log."createdAt" DESC
      LIMIT 1
    ) rejection ON TRUE
    WHERE cc."collaboratorId" = ${collaboratorId}
      AND p."contractId" = ${companyContractId}
    ORDER BY
      CASE cc."status"::text
        WHEN 'active' THEN 0
        WHEN 'pending_signature' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END,
      COALESCE(gc."createdAt", cc."createdAt") DESC
  `);
}

export const collaboratorContractService = {
  async preview(companyContractId: string, input: CollaboratorContractInput, client: DbClient = prisma) {
    const resolved = await resolveContext(client, companyContractId, input, false);
    return {
      html: contractDocumentService.renderTemplate(resolved.template, resolved.context),
      context: resolved.context,
      party: { type: 'COLLABORATOR' as const, id: resolved.collaborator.id },
    };
  },

  async generate(
    companyContractId: string,
    input: CollaboratorContractInput,
    actor: ContractActor = {},
    client: PrismaClient = prisma
  ) {
    return client.$transaction(async (tx) => {
      const resolved = await resolveContext(tx, companyContractId, input, true);
      const renderedHtml = contractDocumentService.renderTemplate(resolved.template, resolved.context);
      const documentId = crypto.randomUUID();
      const linkId = crypto.randomUUID();
      const snapshot = JSON.stringify({
        party: { type: 'COLLABORATOR', id: resolved.collaborator.id },
        values: resolved.context,
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GeneratedContract" (
          "id", "companyContractId", "templateId", "templateVersion",
          "alunoId", "collaboratorId", "partyType", "origin",
          "responsavelName", "responsavelCpf", "responsavelEmail",
          "serviceId", "professorId", "status", "title", "renderedHtml",
          "dataSnapshot", "documentHash", "createdAt", "updatedAt"
        ) VALUES (
          ${documentId}, ${companyContractId}, ${resolved.template.id}, ${resolved.template.version},
          NULL, ${resolved.collaborator.id}, 'COLLABORATOR'::"ContractPartyType", 'ELECTRONIC'::"ContractLinkOrigin",
          NULL, NULL, ${resolved.collaborator.user.email},
          NULL, NULL, 'GENERATED'::"ContractStatus", ${resolved.template.name}, ${renderedHtml},
          ${snapshot}::jsonb, ${hashDocument(renderedHtml)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CollaboratorContract" (
          "id", "collaboratorId", "contractId", "status", "origin",
          "startDate", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${linkId}, ${resolved.collaborator.id}, ${documentId},
          'draft'::"CollaboratorContractStatus", 'ELECTRONIC'::"ContractLinkOrigin",
          ${toOptionalDate(input.dataInicio)}, ${input.notes || input.horarios || null},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      await tx.contractAuditLog.create({
        data: {
          contractId: documentId,
          actorUserId: actor.userId,
          action: 'GENERATED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: {
            templateId: resolved.template.id,
            partyType: 'COLLABORATOR',
            partyId: resolved.collaborator.id,
            linkId,
          } as PrismaTypes.InputJsonObject,
        },
      });

      return { id: documentId, linkId, title: resolved.template.name, status: 'GENERATED' as const };
    });
  },

  async summary(companyContractId: string, collaboratorId: string, client: DbClient = prisma) {
    const collaborator = await client.professor.findFirst({
      where: { id: collaboratorId, contractId: companyContractId },
      select: { id: true, currentStatus: true },
    });
    if (!collaborator) throw new Error('Colaborador não encontrado');

    const rows = await listRows(client, companyContractId, collaboratorId);
    return {
      current: rows.find((item) => item.status === 'active') ?? null,
      candidates: rows.filter((item) => item.status === 'draft' || item.status === 'pending_signature'),
      history: rows.filter((item) => item.status !== 'active' && item.status !== 'draft' && item.status !== 'pending_signature'),
      all: rows,
    };
  },

  async assertDocumentBelongsToCollaborator(
    companyContractId: string,
    collaboratorId: string,
    documentId: string,
    client: DbClient = prisma
  ) {
    const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT gc."id"
      FROM "GeneratedContract" gc
      JOIN "Professor" p ON p."id" = gc."collaboratorId"
      WHERE gc."id" = ${documentId}
        AND gc."partyType" = 'COLLABORATOR'::"ContractPartyType"
        AND gc."collaboratorId" = ${collaboratorId}
        AND gc."companyContractId" = ${companyContractId}
        AND p."contractId" = ${companyContractId}
      LIMIT 1
    `);
    if (!rows[0]) throw new Error('Contrato do colaborador não encontrado');
  },

  async setStatusByGeneratedContractId(
    documentId: string,
    status: 'draft' | 'pending_signature' | 'active' | 'expired' | 'canceled' | 'terminated',
    patch: {
      startDate?: Date | null;
      endDate?: Date | null;
      signedAt?: Date | null;
      canceledAt?: Date | null;
      cancellationReason?: string | null;
    } = {},
    client: DbClient = prisma
  ) {
    const current = await client.collaboratorContract.findUnique({
      where: { contractId: documentId },
      select: { status: true },
    });
    if (!current) return null;
    const terminalStatuses = ['canceled', 'expired', 'terminated', 'legacy'] as const;
    if (terminalStatuses.includes(current.status as (typeof terminalStatuses)[number]) && current.status !== status) {
      return current;
    }

    const patchJson = JSON.stringify(patch);
    await client.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"
      SET
        "status" = ${status}::"CollaboratorContractStatus",
        "startDate" = CASE WHEN ${patchJson}::jsonb ? 'startDate' THEN (${patchJson}::jsonb ->> 'startDate')::timestamp ELSE "startDate" END,
        "endDate" = CASE WHEN ${patchJson}::jsonb ? 'endDate' THEN (${patchJson}::jsonb ->> 'endDate')::timestamp ELSE "endDate" END,
        "signedAt" = CASE WHEN ${patchJson}::jsonb ? 'signedAt' THEN (${patchJson}::jsonb ->> 'signedAt')::timestamp ELSE "signedAt" END,
        "canceledAt" = CASE WHEN ${patchJson}::jsonb ? 'canceledAt' THEN (${patchJson}::jsonb ->> 'canceledAt')::timestamp ELSE "canceledAt" END,
        "cancellationReason" = CASE WHEN ${patchJson}::jsonb ? 'cancellationReason' THEN ${patchJson}::jsonb ->> 'cancellationReason' ELSE "cancellationReason" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "contractId" = ${documentId}
    `);
    return client.collaboratorContract.findUnique({ where: { contractId: documentId } });
  },
};
