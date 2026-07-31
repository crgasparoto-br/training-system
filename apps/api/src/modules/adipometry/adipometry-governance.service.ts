import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN,
  ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY,
  type AdipometryClinicalResponsibleSummary,
  type AdipometryEligibleClinicalResponsible,
  type AdipometryGovernanceResponse,
  type AdipometryGovernedProtocolSummary,
  type AdipometryProtocolApprovalSummary,
  type ApproveAdipometryProtocolInput,
  type DesignateAdipometryClinicalResponsibleInput,
} from '@corrida/types';

const prisma = new PrismaClient();

export class AdipometryGovernanceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = 'AdipometryGovernanceError';
  }
}

interface ProfessionalRow {
  professorId: string;
  userId: string;
  professorName: string;
  professorCref: string | null;
  collaboratorFunctionName: string;
  role: string;
  currentStatus: string | null;
  dismissalDate: Date | null;
  userIsActive: boolean;
  hasApprovalPermission: boolean;
}

interface ResponsibilityRow {
  id: string;
  contractId: string;
  domain: string;
  professorId: string;
  professorName: string;
  professorCref: string;
  collaboratorFunctionName: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  designatedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
}

interface ProtocolRow {
  id: string;
  code: string;
  version: number;
  name: string;
  status: 'DRAFT' | 'APPROVED' | 'DISABLED';
  reference: string | null;
  definitionSnapshot: Prisma.JsonValue;
}

interface ApprovalRow {
  id: string;
  contractId: string;
  protocolId: string;
  protocolCode: string;
  protocolVersion: number;
  responsibilityId: string;
  approvedByProfessorId: string;
  approvedByNameSnapshot: string;
  approvedByCrefSnapshot: string;
  approvedAt: Date;
  approvalStatement: string;
  approvedSpecificationHash: string;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

export function buildAdipometrySpecificationHash(input: {
  code: string;
  version: number;
  reference: string | null;
  definitionSnapshot: Prisma.JsonValue;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        sortJson({
          code: input.code,
          version: input.version,
          reference: input.reference,
          definitionSnapshot: input.definitionSnapshot,
        })
      )
    )
    .digest('hex');
}

function isActiveStatus(value: string | null): boolean {
  if (!value) return true;
  return !['inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'].includes(
    value.trim().toLowerCase()
  );
}

function isEligibleProfessional(row: ProfessionalRow, now = new Date()): boolean {
  return Boolean(
    row.userIsActive &&
      row.professorName.trim() &&
      row.professorCref?.trim() &&
      (!row.dismissalDate || row.dismissalDate > now) &&
      isActiveStatus(row.currentStatus) &&
      (row.role === 'master' || row.hasApprovalPermission)
  );
}

async function listProfessionalRows(client: DbClient, contractId: string): Promise<ProfessionalRow[]> {
  return client.$queryRaw<ProfessionalRow[]>(Prisma.sql`
    SELECT
      professor.id AS "professorId",
      professor."userId" AS "userId",
      profile.name AS "professorName",
      profile.cref AS "professorCref",
      function.name AS "collaboratorFunctionName",
      professor.role::TEXT AS role,
      professor."currentStatus" AS "currentStatus",
      professor."dismissalDate" AS "dismissalDate",
      app_user."isActive" AS "userIsActive",
      EXISTS (
        SELECT 1
        FROM "AccessPermission" permission
        WHERE permission."collaboratorFunctionId" = professor."collaboratorFunctionId"
          AND permission."screenKey" = 'settings.contract'
          AND permission."blockKey" = ${ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY}
          AND permission."canView" = TRUE
      ) AS "hasApprovalPermission"
    FROM "Professor" professor
    JOIN "User" app_user ON app_user.id = professor."userId"
    JOIN "Profile" profile ON profile."userId" = app_user.id
    JOIN "CollaboratorFunctionOption" function ON function.id = professor."collaboratorFunctionId"
    WHERE professor."contractId" = ${contractId}
    ORDER BY profile.name ASC
  `);
}

async function requireEligibleProfessional(
  client: DbClient,
  contractId: string,
  professorId: string
): Promise<ProfessionalRow> {
  const rows = await listProfessionalRows(client, contractId);
  const professional = rows.find((row) => row.professorId === professorId);

  if (!professional) {
    throw new AdipometryGovernanceError(
      'O profissional selecionado não pertence a este contrato.',
      'ADIPOMETRY_RESPONSIBLE_OUTSIDE_CONTRACT'
    );
  }
  if (!professional.userIsActive || !isActiveStatus(professional.currentStatus)) {
    throw new AdipometryGovernanceError(
      'O profissional selecionado não está ativo.',
      'ADIPOMETRY_RESPONSIBLE_INACTIVE'
    );
  }
  if (professional.dismissalDate && professional.dismissalDate <= new Date()) {
    throw new AdipometryGovernanceError(
      'O profissional selecionado possui desligamento vigente.',
      'ADIPOMETRY_RESPONSIBLE_DISMISSED'
    );
  }
  if (!professional.professorCref?.trim()) {
    throw new AdipometryGovernanceError(
      'Preencha o CREF pessoal do profissional antes de designá-lo.',
      'ADIPOMETRY_RESPONSIBLE_MISSING_CREF'
    );
  }
  if (!(professional.role === 'master' || professional.hasApprovalPermission)) {
    throw new AdipometryGovernanceError(
      'A função do profissional não possui permissão para aprovação clínica da adipometria.',
      'ADIPOMETRY_RESPONSIBLE_PERMISSION_REQUIRED',
      403
    );
  }

  return professional;
}

async function listResponsibilities(
  client: DbClient,
  contractId: string
): Promise<ResponsibilityRow[]> {
  return client.$queryRaw<ResponsibilityRow[]>(Prisma.sql`
    SELECT
      responsibility.id,
      responsibility."contractId",
      responsibility.domain,
      responsibility."professorId",
      profile.name AS "professorName",
      profile.cref AS "professorCref",
      function.name AS "collaboratorFunctionName",
      responsibility."effectiveFrom",
      responsibility."effectiveTo",
      responsibility."designatedAt",
      responsibility."endedAt",
      responsibility."endReason"
    FROM "AdipometryClinicalResponsibility" responsibility
    JOIN "Professor" professor
      ON professor.id = responsibility."professorId"
     AND professor."contractId" = responsibility."contractId"
    JOIN "User" app_user ON app_user.id = professor."userId"
    JOIN "Profile" profile ON profile."userId" = app_user.id
    JOIN "CollaboratorFunctionOption" function ON function.id = professor."collaboratorFunctionId"
    WHERE responsibility."contractId" = ${contractId}
      AND responsibility.domain = ${ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN}
    ORDER BY responsibility."effectiveFrom" DESC, responsibility."designatedAt" DESC
  `);
}

async function listProtocols(client: DbClient): Promise<ProtocolRow[]> {
  return client.$queryRaw<ProtocolRow[]>(Prisma.sql`
    SELECT id, code, version, name, status, reference, "definitionSnapshot"
    FROM "AdipometryProtocol"
    WHERE code = 'GUEDES_1991_ADULT_YOUNG'
    ORDER BY version DESC
  `);
}

async function listApprovals(client: DbClient, contractId: string): Promise<ApprovalRow[]> {
  return client.$queryRaw<ApprovalRow[]>(Prisma.sql`
    SELECT
      id,
      "contractId",
      "protocolId",
      "protocolCode",
      "protocolVersion",
      "responsibilityId",
      "approvedByProfessorId",
      "approvedByNameSnapshot",
      "approvedByCrefSnapshot",
      "approvedAt",
      "approvalStatement",
      "approvedSpecificationHash"
    FROM "AdipometryProtocolApproval"
    WHERE "contractId" = ${contractId}
    ORDER BY "approvedAt" DESC
  `);
}

function serializeResponsibility(row: ResponsibilityRow): AdipometryClinicalResponsibleSummary {
  return {
    id: row.id,
    contractId: row.contractId,
    domain: ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN,
    professorId: row.professorId,
    professorName: row.professorName,
    professorCref: row.professorCref,
    collaboratorFunctionName: row.collaboratorFunctionName,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    designatedAt: row.designatedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason,
    active: row.effectiveTo === null,
  };
}

function serializeApproval(row: ApprovalRow): AdipometryProtocolApprovalSummary {
  return {
    id: row.id,
    contractId: row.contractId,
    protocolCode: row.protocolCode,
    protocolVersion: row.protocolVersion,
    responsibilityId: row.responsibilityId,
    approvedByProfessorId: row.approvedByProfessorId,
    approvedByNameSnapshot: row.approvedByNameSnapshot,
    approvedByCrefSnapshot: row.approvedByCrefSnapshot,
    approvedAt: row.approvedAt.toISOString(),
    approvalStatement: row.approvalStatement,
    approvedSpecificationHash: row.approvedSpecificationHash,
  };
}

async function getGovernance(
  contractId: string,
  currentProfessorId: string,
  canManageResponsibility: boolean,
  client: DbClient = prisma
): Promise<AdipometryGovernanceResponse> {
  const [responsibilityRows, professionalRows, protocolRows, approvalRows] = await Promise.all([
    listResponsibilities(client, contractId),
    listProfessionalRows(client, contractId),
    listProtocols(client),
    listApprovals(client, contractId),
  ]);

  const currentResponsibilityRow = responsibilityRows.find((item) => item.effectiveTo === null) ?? null;
  const currentProfessional = professionalRows.find((item) => item.professorId === currentProfessorId);
  const canCurrentUserApprove = Boolean(
    currentResponsibilityRow?.professorId === currentProfessorId &&
      currentProfessional &&
      isEligibleProfessional(currentProfessional)
  );

  const eligibleProfessionals: AdipometryEligibleClinicalResponsible[] = canManageResponsibility
    ? professionalRows.filter((row) => isEligibleProfessional(row)).map((row) => ({
        professorId: row.professorId,
        professorName: row.professorName,
        professorCref: row.professorCref!.trim(),
        collaboratorFunctionName: row.collaboratorFunctionName,
      }))
    : [];

  const protocols: AdipometryGovernedProtocolSummary[] = protocolRows.map((protocol) => {
    const approval = approvalRows.find(
      (item) =>
        item.protocolId === protocol.id &&
        item.protocolCode === protocol.code &&
        item.protocolVersion === protocol.version
    );
    const definition = protocol.definitionSnapshot as Record<string, unknown>;

    return {
      id: protocol.id,
      code: protocol.code,
      version: protocol.version,
      internalVersion:
        typeof definition.internalVersion === 'string' ? definition.internalVersion : String(protocol.version),
      name: protocol.name,
      definitionStatus: protocol.status,
      contractStatus: protocol.status === 'DISABLED' ? 'DISABLED' : approval ? 'APPROVED' : 'DRAFT',
      reference: protocol.reference,
      specificationHash: buildAdipometrySpecificationHash(protocol),
      approval: approval ? serializeApproval(approval) : null,
    };
  });

  return {
    domain: ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN,
    currentResponsibility: currentResponsibilityRow
      ? serializeResponsibility(currentResponsibilityRow)
      : null,
    responsibilityHistory: responsibilityRows.map(serializeResponsibility),
    eligibleProfessionals,
    protocols,
    canManageResponsibility,
    canCurrentUserApprove,
  };
}

export const adipometryGovernanceService = {
  getGovernance,

  async designate(
    contractId: string,
    actorUserId: string,
    actorProfessorId: string,
    input: DesignateAdipometryClinicalResponsibleInput
  ): Promise<AdipometryGovernanceResponse> {
    const professorId = typeof input.professorId === 'string' ? input.professorId.trim() : '';
    if (!professorId) {
      throw new AdipometryGovernanceError(
        'Selecione o profissional responsável.',
        'MISSING_ADIPOMETRY_CLINICAL_RESPONSIBLE'
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${`${contractId}:${ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN}`}, 0))
        `);

        await requireEligibleProfessional(tx, contractId, professorId);

        const currentRows = await tx.$queryRaw<Array<{ id: string; professorId: string }>>(Prisma.sql`
          SELECT id, "professorId"
          FROM "AdipometryClinicalResponsibility"
          WHERE "contractId" = ${contractId}
            AND domain = ${ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN}
            AND "effectiveTo" IS NULL
          FOR UPDATE
        `);
        const current = currentRows[0];

        if (current?.professorId === professorId) return;

        const endReason = typeof input.endReason === 'string' ? input.endReason.trim() : '';
        if (current && !endReason) {
          throw new AdipometryGovernanceError(
            'Informe o motivo da troca para preservar o histórico da designação.',
            'ADIPOMETRY_RESPONSIBILITY_END_REASON_REQUIRED'
          );
        }

        const now = new Date();
        if (current) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "AdipometryClinicalResponsibility"
            SET
              "effectiveTo" = ${now},
              "endedByUserId" = ${actorUserId},
              "endedAt" = ${now},
              "endReason" = ${endReason},
              "updatedAt" = ${now}
            WHERE id = ${current.id}
          `);
        }

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "AdipometryClinicalResponsibility" (
            id, "contractId", domain, "professorId", "effectiveFrom",
            "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${contractId}, ${ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN},
            ${professorId}, ${now}, ${actorUserId}, ${now}, ${now}, ${now}
          )
        `);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return getGovernance(contractId, actorProfessorId, true);
  },

  async approve(
    contractId: string,
    actorUserId: string,
    actorProfessorId: string,
    code: string,
    version: number,
    input: ApproveAdipometryProtocolInput,
    canManageResponsibility: boolean
  ): Promise<AdipometryGovernanceResponse> {
    const approvalStatement =
      typeof input.approvalStatement === 'string' ? input.approvalStatement.trim() : '';
    const expectedHash =
      typeof input.approvedSpecificationHash === 'string'
        ? input.approvedSpecificationHash.trim().toLowerCase()
        : '';

    if (approvalStatement.length < 30) {
      throw new AdipometryGovernanceError(
        'Confirme a declaração de aprovação clínica antes de continuar.',
        'ADIPOMETRY_APPROVAL_STATEMENT_REQUIRED'
      );
    }
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new AdipometryGovernanceError(
        'O hash da especificação clínica é inválido.',
        'ADIPOMETRY_SPECIFICATION_HASH_INVALID'
      );
    }
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new AdipometryGovernanceError(
        'A versão do protocolo é inválida.',
        'ADIPOMETRY_PROTOCOL_VERSION_INVALID'
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${`${contractId}:${code}:${version}`}, 0))
        `);

        const responsibilityRows = await tx.$queryRaw<Array<{ id: string; professorId: string }>>(Prisma.sql`
          SELECT id, "professorId"
          FROM "AdipometryClinicalResponsibility"
          WHERE "contractId" = ${contractId}
            AND domain = ${ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN}
            AND "effectiveTo" IS NULL
          FOR UPDATE
        `);
        const responsibility = responsibilityRows[0];

        if (!responsibility) {
          throw new AdipometryGovernanceError(
            'Cadastre um responsável técnico antes de aprovar o protocolo.',
            'MISSING_ADIPOMETRY_CLINICAL_RESPONSIBLE'
          );
        }
        if (responsibility.professorId !== actorProfessorId) {
          throw new AdipometryGovernanceError(
            'A aprovação deve ser realizada pelo próprio responsável técnico autenticado.',
            'ADIPOMETRY_APPROVAL_REQUIRES_DESIGNATED_RESPONSIBLE',
            403
          );
        }

        const professional = await requireEligibleProfessional(tx, contractId, actorProfessorId);
        if (professional.userId !== actorUserId) {
          throw new AdipometryGovernanceError(
            'A conta autenticada não corresponde ao responsável técnico designado.',
            'ADIPOMETRY_APPROVAL_ACTOR_MISMATCH',
            403
          );
        }

        const protocols = await tx.$queryRaw<ProtocolRow[]>(Prisma.sql`
          SELECT id, code, version, name, status, reference, "definitionSnapshot"
          FROM "AdipometryProtocol"
          WHERE code = ${code} AND version = ${version}
          FOR UPDATE
        `);
        const protocol = protocols[0];

        if (!protocol) {
          throw new AdipometryGovernanceError(
            'Versão clínica não encontrada.',
            'ADIPOMETRY_PROTOCOL_VERSION_NOT_FOUND',
            404
          );
        }
        if (protocol.status === 'DISABLED') {
          throw new AdipometryGovernanceError(
            'Esta versão clínica está indisponível.',
            'ADIPOMETRY_PROTOCOL_DISABLED'
          );
        }

        const actualHash = buildAdipometrySpecificationHash(protocol);
        if (actualHash !== expectedHash) {
          throw new AdipometryGovernanceError(
            'A especificação clínica mudou. Recarregue a página e revise a versão atual antes de aprovar.',
            'ADIPOMETRY_SPECIFICATION_HASH_MISMATCH',
            409
          );
        }

        const validRows = await tx.$queryRaw<Array<{ valid: boolean }>>(Prisma.sql`
          SELECT "isValidAdipometryContractProtocolDefinition"(
            CAST(${JSON.stringify(protocol.definitionSnapshot)} AS JSONB)
          ) AS valid
        `);
        if (!validRows[0]?.valid || !protocol.reference?.trim()) {
          throw new AdipometryGovernanceError(
            'A versão clínica não possui todos os dados, limites e vetores exigidos para aprovação.',
            'ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE'
          );
        }

        const now = new Date();
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "AdipometryProtocolApproval" (
            id, "contractId", "protocolId", "protocolCode", "protocolVersion",
            "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
            "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
            "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${contractId}, ${protocol.id}, ${protocol.code}, ${protocol.version},
            ${responsibility.id}, ${actorProfessorId}, ${actorUserId}, ${now},
            ${approvalStatement}, ${professional.professorName.trim()}, ${professional.professorCref!.trim()},
            ${actualHash}, CAST(${JSON.stringify(protocol.definitionSnapshot)} AS JSONB), ${now}
          )
        `);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return getGovernance(contractId, actorProfessorId, canManageResponsibility);
  },
};
