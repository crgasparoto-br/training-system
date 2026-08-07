import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CompleteParqDTO,
  ParqAdministrativeSummaryDTO,
  ParqErrorCode,
  ParqFlowStatus,
  ParqPositiveItem,
  ParqResponses,
  ParqSessionDTO,
  ParqSubmissionDTO,
  ReviewParqDTO,
  SaveParqDraftDTO,
} from '@corrida/types';
import {
  PARQ_CATALOG_VERSION,
  PARQ_LEGACY_CATALOG_VERSION,
} from '@corrida/types';
import {
  evaluateParqResponses,
  getCanonicalParqCatalog,
  isKnownParqCatalogVersion,
  validateParqCatalogVersion,
  validateParqResponses,
} from './pre-registration-parq.domain.js';
import {
  isBasicPreRegistrationCompletedStatus,
  lockAndAuthorizePreRegistrationProcess,
} from './pre-registration-public-atomic.service.js';

const prisma = new PrismaClient();
const NOTICE_VERSION =
  process.env.HEALTH_PRIVACY_NOTICE_VERSION?.trim() ||
  process.env.PRIVACY_NOTICE_VERSION?.trim() ||
  '2026-07';

const KNOWN_CATALOGS = [PARQ_CATALOG_VERSION, PARQ_LEGACY_CATALOG_VERSION] as const;

type DraftRow = {
  id: string;
  alunoId: string;
  contractId: string;
  catalogVersion: string;
  responses: Prisma.JsonValue;
  version: number;
  consentNoticeVersion: string;
  consentAcceptedAt: Date;
  consentAcceptedByUserId: string;
  lastSavedAt: Date;
};

type SubmissionRow = {
  id: string;
  alunoId: string;
  contractId: string;
  sourceType: 'student' | 'professional' | 'integration' | 'system';
  catalogVersion: string;
  responses: Prisma.JsonValue;
  positiveItems: Prisma.JsonValue | null;
  positiveCount: number;
  declarationAccepted: boolean;
  submittedAt: Date;
  idempotencyKey: string | null;
  reviewId: string | null;
  reviewStatus: 'PENDING' | 'REVIEWED' | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
};

type LegacyStateRow = { preserved: boolean; needsRepeat: boolean };

type ParqProcessStateRow = {
  parqModuleStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  parqConsentVersion: number;
  parqConsentNoticeVersion: string | null;
  parqConsentAcceptedAt: Date | null;
  parqConsentAcceptedByUserId: string | null;
  parqConsentRevokedAt: Date | null;
  parqConsentRevokedByUserId: string | null;
};

type ConsentInput = SaveParqDraftDTO['consent'];

export class ParqServiceError extends Error {
  constructor(
    message: string,
    readonly code: ParqErrorCode,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ParqServiceError';
  }
}

function responseRecord(value: Prisma.JsonValue | null | undefined): ParqResponses {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ParqResponses;
}

function positiveItems(value: Prisma.JsonValue | null | undefined): ParqPositiveItem[] {
  if (!Array.isArray(value)) return [];
  const items: ParqPositiveItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Prisma.JsonObject;
    if (typeof record.key !== 'string' || typeof record.label !== 'string') continue;
    items.push({
      key: record.key as ParqPositiveItem['key'],
      label: record.label,
    });
  }
  return items;
}

function validateConsentPayload(input: ConsentInput) {
  if (!input?.accepted) {
    throw new ParqServiceError(
      'Leia e aceite o aviso de privacidade antes de salvar informações de saúde.',
      'CONSENT_REQUIRED'
    );
  }
  if (input.privacyNoticeVersion !== NOTICE_VERSION) {
    throw new ParqServiceError(
      'O aviso de privacidade foi atualizado. Revise a versão atual antes de continuar.',
      'CONSENT_VERSION_MISMATCH',
      { requiredVersion: NOTICE_VERSION }
    );
  }
}

function statusOf(
  latest: SubmissionRow | undefined,
  draft: DraftRow | undefined,
  process: ParqProcessStateRow,
  legacy: LegacyStateRow
): ParqFlowStatus {
  if (process.parqModuleStatus === 'IN_PROGRESS' && draft) return 'IN_PROGRESS';
  if (latest) return latest.positiveCount > 0 ? 'COMPLETED_REVIEW_REQUIRED' : 'COMPLETED_NO_ALERT';
  return legacy.needsRepeat ? 'NEEDS_REPEAT' : 'NOT_STARTED';
}

async function assertAlunoInContract(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Aluno"
    WHERE "id" = ${alunoId} AND "contractId" = ${contractId}
    LIMIT 1
  `;
  if (!rows[0]) throw new ParqServiceError('Cadastro não encontrado.', 'NOT_FOUND');
}

async function readParqProcessState(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<ParqProcessStateRow> {
  const rows = await tx.$queryRaw<ParqProcessStateRow[]>`
    SELECT "parqModuleStatus", "parqConsentVersion", "parqConsentNoticeVersion",
           "parqConsentAcceptedAt", "parqConsentAcceptedByUserId",
           "parqConsentRevokedAt", "parqConsentRevokedByUserId"
    FROM "StudentOnboardingProcess"
    WHERE "alunoId" = ${alunoId} AND "contractId" = ${contractId}
    LIMIT 1
  `;
  if (!rows[0]) throw new ParqServiceError('Cadastro não encontrado.', 'NOT_FOUND');
  return rows[0];
}

async function readDraft(tx: Prisma.TransactionClient, alunoId: string): Promise<DraftRow | undefined> {
  const rows = await tx.$queryRaw<DraftRow[]>`
    SELECT "id", "alunoId", "contractId", "catalogVersion", "responses", "version",
           "consentNoticeVersion", "consentAcceptedAt", "consentAcceptedByUserId", "lastSavedAt"
    FROM "StudentParqDraft"
    WHERE "alunoId" = ${alunoId}
    LIMIT 1
  `;
  return rows[0];
}

function submissionSelect(whereFragment: Prisma.Sql, limitFragment = Prisma.empty) {
  return Prisma.sql`
    SELECT submission."id", submission."alunoId", submission."contractId",
           submission."sourceType"::text AS "sourceType", submission."catalogVersion",
           submission."responses", submission."positiveItems", submission."positiveCount",
           submission."declarationAccepted", submission."submittedAt", submission."idempotencyKey",
           review."id" AS "reviewId", review."status" AS "reviewStatus",
           review."reviewedAt", review."reviewNotes"
    FROM "StudentParqSubmission" AS submission
    LEFT JOIN "StudentParqProfessionalReview" AS review
      ON review."submissionId" = submission."id"
    WHERE submission."catalogVersion" IN (${Prisma.join([...KNOWN_CATALOGS])})
      AND submission."declarationAccepted" = true
      AND ${whereFragment}
    ORDER BY submission."submittedAt" DESC, submission."createdAt" DESC, submission."id" DESC
    ${limitFragment}
  `;
}

async function readSubmissionRows(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string,
  limit?: number
): Promise<SubmissionRow[]> {
  const limitFragment = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  return tx.$queryRaw<SubmissionRow[]>(
    submissionSelect(
      Prisma.sql`submission."contractId" = ${contractId} AND submission."alunoId" = ${alunoId}`,
      limitFragment
    )
  );
}

async function readSubmissionByIdempotencyKey(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string,
  idempotencyKey: string
): Promise<SubmissionRow | undefined> {
  return (
    await tx.$queryRaw<SubmissionRow[]>(
      submissionSelect(
        Prisma.sql`submission."contractId" = ${contractId}
          AND submission."alunoId" = ${alunoId}
          AND submission."idempotencyKey" = ${idempotencyKey}`,
        Prisma.sql`LIMIT 1`
      )
    )
  )[0];
}

async function readLatestSubmission(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string
): Promise<SubmissionRow | undefined> {
  return (await readSubmissionRows(tx, contractId, alunoId, 1))[0];
}

async function readLegacyState(tx: Prisma.TransactionClient, alunoId: string): Promise<LegacyStateRow> {
  const rows = await tx.$queryRaw<LegacyStateRow[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM "StudentParqLegacyRecord" WHERE "alunoId" = ${alunoId}
      ) AS "preserved",
      EXISTS (
        SELECT 1 FROM "StudentParqLegacyRecord"
        WHERE "alunoId" = ${alunoId}
          AND "migrationStatus" IN ('INCOMPATIBLE', 'DIVERGENT')
      ) AS "needsRepeat"
  `;
  return rows[0] ?? { preserved: false, needsRepeat: false };
}

function mapSubmission(row: SubmissionRow): ParqSubmissionDTO {
  if (!isKnownParqCatalogVersion(row.catalogVersion)) {
    throw new ParqServiceError('Versão histórica do PAR-Q não reconhecida.', 'UNKNOWN_CATALOG_VERSION');
  }
  return {
    id: row.id,
    alunoId: row.alunoId,
    contractId: row.contractId,
    catalogVersion: row.catalogVersion,
    submittedAt: row.submittedAt.toISOString(),
    responses: responseRecord(row.responses),
    positiveItems: positiveItems(row.positiveItems),
    positiveCount: row.positiveCount,
    declarationAccepted: true,
    sourceType: row.sourceType,
    review: row.reviewId && row.reviewStatus
      ? {
          id: row.reviewId,
          status: row.reviewStatus,
          reviewedAt: row.reviewedAt?.toISOString(),
          reviewNotes: row.reviewNotes ?? undefined,
        }
      : undefined,
  };
}

function consentView(process: ParqProcessStateRow): ParqSessionDTO['consent'] {
  return {
    requiredVersion: NOTICE_VERSION,
    version: process.parqConsentVersion,
    acceptedVersion: process.parqConsentNoticeVersion ?? undefined,
    acceptedAt: process.parqConsentAcceptedAt?.toISOString(),
    revokedAt: process.parqConsentRevokedAt?.toISOString(),
  };
}

async function buildSession(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string,
  replayed?: SubmissionRow
): Promise<ParqSessionDTO> {
  const [draft, latest, legacy, process] = await Promise.all([
    readDraft(tx, alunoId),
    readLatestSubmission(tx, contractId, alunoId),
    readLegacyState(tx, alunoId),
    readParqProcessState(tx, alunoId, contractId),
  ]);
  const inProgress = process.parqModuleStatus === 'IN_PROGRESS';
  return {
    alunoId,
    catalog: getCanonicalParqCatalog(),
    status: statusOf(latest, draft, process, legacy),
    version: draft?.version ?? 1,
    responses: inProgress && draft ? responseRecord(draft.responses) : {},
    consent: consentView(process),
    lastSavedAt: inProgress ? draft?.lastSavedAt?.toISOString() : undefined,
    latestSubmission: latest ? mapSubmission(latest) : undefined,
    replayedSubmission: replayed ? mapSubmission(replayed) : undefined,
    legacy,
  };
}

async function recordEvent(
  tx: Prisma.TransactionClient,
  params: {
    alunoId: string;
    contractId: string;
    eventType:
      | 'PARQ_STARTED'
      | 'PARQ_SAVED'
      | 'PARQ_COMPLETED'
      | 'PARQ_REVIEWED'
      | 'PARQ_CONSENT_ACCEPTED'
      | 'PARQ_CONSENT_REVOKED';
    actorUserId?: string;
    actorProfessorId?: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.studentLifecycleEvent.create({
    data: {
      alunoId: params.alunoId,
      contractId: params.contractId,
      eventType: params.eventType,
      actorUserId: params.actorUserId,
      actorProfessorId: params.actorProfessorId,
      metadata: params.metadata,
    },
  });
}

function activeConsent(process: ParqProcessStateRow) {
  return Boolean(
    process.parqConsentAcceptedAt &&
    !process.parqConsentRevokedAt &&
    process.parqConsentNoticeVersion === NOTICE_VERSION
  );
}

async function acceptConsent(
  tx: Prisma.TransactionClient,
  process: ParqProcessStateRow,
  alunoId: string,
  contractId: string,
  userId: string,
  input: ConsentInput
): Promise<ParqProcessStateRow> {
  validateConsentPayload(input);
  if (input.expectedVersion !== process.parqConsentVersion) {
    throw new ParqServiceError(
      'O consentimento do PAR-Q foi alterado em outro acesso. Recarregue antes de continuar.',
      'CONCURRENT_MODIFICATION',
      { currentVersion: process.parqConsentVersion }
    );
  }
  if (activeConsent(process)) return process;

  const nextVersion = process.parqConsentAcceptedAt
    ? process.parqConsentVersion + 1
    : process.parqConsentVersion;
  const acceptedAt = new Date();
  await tx.studentOnboardingProcess.update({
    where: { alunoId },
    data: {
      parqConsentVersion: nextVersion,
      parqConsentNoticeVersion: NOTICE_VERSION,
      parqConsentAcceptedAt: acceptedAt,
      parqConsentAcceptedByUserId: userId,
      parqConsentRevokedAt: null,
      parqConsentRevokedByUserId: null,
    },
  });
  await recordEvent(tx, {
    alunoId,
    contractId,
    actorUserId: userId,
    eventType: 'PARQ_CONSENT_ACCEPTED',
    metadata: { noticeVersion: NOTICE_VERSION, consentVersion: nextVersion },
  });
  return {
    ...process,
    parqConsentVersion: nextVersion,
    parqConsentNoticeVersion: NOTICE_VERSION,
    parqConsentAcceptedAt: acceptedAt,
    parqConsentAcceptedByUserId: userId,
    parqConsentRevokedAt: null,
    parqConsentRevokedByUserId: null,
  };
}

async function writeDraftState(
  tx: Prisma.TransactionClient,
  params: {
    existing?: DraftRow;
    alunoId: string;
    contractId: string;
    userId: string;
    responses: ParqResponses;
    version: number;
  }
) {
  const id = params.existing?.id ?? crypto.randomUUID();
  await tx.$executeRaw`
    INSERT INTO "StudentParqDraft" (
      "id", "alunoId", "contractId", "catalogVersion", "responses", "version",
      "consentNoticeVersion", "consentAcceptedAt", "consentAcceptedByUserId",
      "lastSavedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${params.alunoId}, ${params.contractId}, ${PARQ_CATALOG_VERSION},
      ${JSON.stringify(params.responses)}::jsonb, ${params.version}, ${NOTICE_VERSION},
      CURRENT_TIMESTAMP, ${params.userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("alunoId") DO UPDATE SET
      "contractId" = EXCLUDED."contractId",
      "catalogVersion" = EXCLUDED."catalogVersion",
      "responses" = EXCLUDED."responses",
      "version" = EXCLUDED."version",
      "consentNoticeVersion" = EXCLUDED."consentNoticeVersion",
      "consentAcceptedAt" = EXCLUDED."consentAcceptedAt",
      "consentAcceptedByUserId" = EXCLUDED."consentAcceptedByUserId",
      "lastSavedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function pendingReviewExists(
  tx: Prisma.TransactionClient,
  contractId: string,
  alunoId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "StudentParqProfessionalReview"
      WHERE "alunoId" = ${alunoId}
        AND "contractId" = ${contractId}
        AND "status" = 'PENDING'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

export const preRegistrationParqService = {
  async getSession(userId: string, alunoId: string) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (!isBasicPreRegistrationCompletedStatus(access.status)) {
        throw new ParqServiceError('Conclua primeiro os dados básicos do pré-cadastro.', 'BASIC_PRE_REGISTRATION_REQUIRED');
      }
      return buildSession(tx, access.contractId, alunoId);
    });
  },

  async saveDraft(userId: string, alunoId: string, input: SaveParqDraftDTO) {
    validateParqCatalogVersion(input.catalogVersion);
    validateParqResponses(input.responses, false);
    validateConsentPayload(input.consent);

    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (!isBasicPreRegistrationCompletedStatus(access.status)) {
        throw new ParqServiceError('Conclua primeiro os dados básicos do pré-cadastro.', 'BASIC_PRE_REGISTRATION_REQUIRED');
      }
      const [existing, process] = await Promise.all([
        readDraft(tx, alunoId),
        readParqProcessState(tx, alunoId, access.contractId),
      ]);
      const currentVersion = existing?.version ?? 1;
      if (input.expectedVersion !== currentVersion) {
        throw new ParqServiceError(
          'Este PAR-Q foi alterado em outro acesso. Recarregue antes de continuar.',
          'CONCURRENT_MODIFICATION',
          { currentVersion }
        );
      }
      await acceptConsent(tx, process, alunoId, access.contractId, userId, input.consent);
      const nextVersion = currentVersion + 1;
      await writeDraftState(tx, {
        existing,
        alunoId,
        contractId: access.contractId,
        userId,
        responses: input.responses,
        version: nextVersion,
      });
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: { parqModuleStatus: 'IN_PROGRESS', lastSavedAt: new Date() },
      });
      await recordEvent(tx, {
        alunoId,
        contractId: access.contractId,
        actorUserId: userId,
        eventType: process.parqModuleStatus === 'IN_PROGRESS' ? 'PARQ_SAVED' : 'PARQ_STARTED',
        metadata: { catalogVersion: PARQ_CATALOG_VERSION, answeredCount: Object.keys(input.responses).length },
      });
      return buildSession(tx, access.contractId, alunoId);
    });
  },

  async complete(userId: string, alunoId: string, input: CompleteParqDTO) {
    validateParqCatalogVersion(input.catalogVersion);
    validateParqResponses(input.responses, true);
    if (!input.declarationAccepted) {
      throw new ParqServiceError('Confirme a declaração antes de concluir.', 'INCOMPLETE_RESPONSES');
    }
    const evaluation = evaluateParqResponses(input.responses);

    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (!isBasicPreRegistrationCompletedStatus(access.status)) {
        throw new ParqServiceError('Conclua primeiro os dados básicos do pré-cadastro.', 'BASIC_PRE_REGISTRATION_REQUIRED');
      }

      const repeated = await readSubmissionByIdempotencyKey(
        tx,
        access.contractId,
        alunoId,
        input.idempotencyKey
      );
      if (repeated) return buildSession(tx, access.contractId, alunoId, repeated);

      validateConsentPayload(input.consent);
      const [draft, process] = await Promise.all([
        readDraft(tx, alunoId),
        readParqProcessState(tx, alunoId, access.contractId),
      ]);
      const currentVersion = draft?.version ?? 1;
      if (input.expectedVersion !== currentVersion) {
        throw new ParqServiceError(
          'Este PAR-Q foi alterado em outro acesso. Recarregue antes de concluir.',
          'CONCURRENT_MODIFICATION',
          { currentVersion }
        );
      }
      await acceptConsent(tx, process, alunoId, access.contractId, userId, input.consent);

      const submissionId = crypto.randomUUID();
      await tx.$executeRaw`
        INSERT INTO "StudentParqSubmission" (
          "id", "alunoId", "contractId", "sourceType", "submittedByUserId", "submittedAt",
          "responses", "positiveItems", "positiveCount", "declarationAccepted", "catalogVersion",
          "idempotencyKey", "createdAt", "updatedAt"
        ) VALUES (
          ${submissionId}, ${alunoId}, ${access.contractId}, 'student', ${userId}, CURRENT_TIMESTAMP,
          ${JSON.stringify(input.responses)}::jsonb, ${JSON.stringify(evaluation.positiveItems)}::jsonb,
          ${evaluation.positiveCount}, true, ${PARQ_CATALOG_VERSION}, ${input.idempotencyKey},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

      if (evaluation.positiveCount > 0) {
        await tx.$executeRaw`
          INSERT INTO "StudentParqProfessionalReview" (
            "id", "submissionId", "alunoId", "contractId", "status",
            "positiveCount", "positiveItems", "createdAt", "updatedAt"
          ) VALUES (
            ${crypto.randomUUID()}, ${submissionId}, ${alunoId}, ${access.contractId}, 'PENDING',
            ${evaluation.positiveCount}, ${JSON.stringify(evaluation.positiveItems)}::jsonb,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `;
      }

      const nextVersion = currentVersion + 1;
      await writeDraftState(tx, {
        existing: draft,
        alunoId,
        contractId: access.contractId,
        userId,
        responses: {},
        version: nextVersion,
      });
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: { parqModuleStatus: 'COMPLETED', parqSubmissionId: submissionId, lastSavedAt: new Date() },
      });
      await tx.aluno.update({
        where: { id: alunoId },
        data: { parqRequiresProfessionalReview: await pendingReviewExists(tx, access.contractId, alunoId) },
      });
      await recordEvent(tx, {
        alunoId,
        contractId: access.contractId,
        actorUserId: userId,
        eventType: 'PARQ_COMPLETED',
        metadata: {
          submissionId,
          catalogVersion: PARQ_CATALOG_VERSION,
          positiveCount: evaluation.positiveCount,
        },
      });
      return buildSession(tx, access.contractId, alunoId);
    });
  },

  async revokeConsent(userId: string, alunoId: string, expectedVersion: number) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (!isBasicPreRegistrationCompletedStatus(access.status)) {
        throw new ParqServiceError('Conclua primeiro os dados básicos do pré-cadastro.', 'BASIC_PRE_REGISTRATION_REQUIRED');
      }
      const process = await readParqProcessState(tx, alunoId, access.contractId);
      if (expectedVersion !== process.parqConsentVersion) {
        throw new ParqServiceError(
          'O consentimento do PAR-Q foi alterado em outro acesso. Recarregue antes de continuar.',
          'CONCURRENT_MODIFICATION',
          { currentVersion: process.parqConsentVersion }
        );
      }
      if (process.parqConsentRevokedAt) return buildSession(tx, access.contractId, alunoId);
      if (!process.parqConsentAcceptedAt) {
        throw new ParqServiceError('Não existe consentimento ativo para revogar.', 'CONSENT_REQUIRED');
      }
      const nextVersion = process.parqConsentVersion + 1;
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: {
          parqConsentVersion: nextVersion,
          parqConsentRevokedAt: new Date(),
          parqConsentRevokedByUserId: userId,
        },
      });
      await recordEvent(tx, {
        alunoId,
        contractId: access.contractId,
        actorUserId: userId,
        eventType: 'PARQ_CONSENT_REVOKED',
        metadata: { consentVersion: nextVersion },
      });
      return buildSession(tx, access.contractId, alunoId);
    });
  },

  async listSubmissions(contractId: string, alunoId: string): Promise<ParqSubmissionDTO[]> {
    return prisma.$transaction(async (tx) => {
      await assertAlunoInContract(tx, contractId, alunoId);
      return (await readSubmissionRows(tx, contractId, alunoId)).map(mapSubmission);
    });
  },

  async summary(contractId: string, alunoId: string): Promise<ParqAdministrativeSummaryDTO> {
    return prisma.$transaction(async (tx) => {
      await assertAlunoInContract(tx, contractId, alunoId);
      const [latest, legacy, process, requiresProfessionalReview] = await Promise.all([
        readLatestSubmission(tx, contractId, alunoId),
        readLegacyState(tx, alunoId),
        readParqProcessState(tx, alunoId, contractId),
        pendingReviewExists(tx, contractId, alunoId),
      ]);
      const draft = await readDraft(tx, alunoId);
      return {
        state: statusOf(latest, draft, process, legacy),
        latestSubmission: latest
          ? {
              id: latest.id,
              catalogVersion: isKnownParqCatalogVersion(latest.catalogVersion)
                ? latest.catalogVersion
                : PARQ_CATALOG_VERSION,
              submittedAt: latest.submittedAt.toISOString(),
              positiveCount: latest.positiveCount,
              review: latest.reviewStatus ? { status: latest.reviewStatus } : undefined,
            }
          : null,
        requiresProfessionalReview,
        legacy,
      };
    });
  },

  async overview(contractId: string, alunoId: string) {
    return prisma.$transaction(async (tx) => {
      await assertAlunoInContract(tx, contractId, alunoId);
      const submissions = (await readSubmissionRows(tx, contractId, alunoId)).map(mapSubmission);
      const session = await buildSession(tx, contractId, alunoId);
      return {
        state: session.status,
        latestSubmission: submissions[0] ?? null,
        submissions,
        legacy: session.legacy,
      };
    });
  },

  async reviewProfessional(
    contractId: string,
    alunoId: string,
    reviewId: string,
    professorId: string,
    input: ReviewParqDTO
  ) {
    return prisma.$transaction(async (tx) => {
      await assertAlunoInContract(tx, contractId, alunoId);
      const professor = await tx.professor.findFirst({
        where: { id: professorId, contractId },
        select: { id: true },
      });
      if (!professor) throw new ParqServiceError('Cadastro não encontrado.', 'NOT_FOUND');

      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "StudentParqProfessionalReview"
        WHERE "id" = ${reviewId} AND "alunoId" = ${alunoId} AND "contractId" = ${contractId}
        FOR UPDATE
      `;
      if (!locked[0]) throw new ParqServiceError('Cadastro não encontrado.', 'NOT_FOUND');
      if (locked[0].status !== 'PENDING') {
        throw new ParqServiceError('Esta pendência já foi analisada.', 'REVIEW_NOT_PENDING');
      }

      const notes = input.reviewNotes?.trim() || null;
      await tx.$executeRaw`
        UPDATE "StudentParqProfessionalReview"
        SET "status" = 'REVIEWED', "reviewedByProfessorId" = ${professorId},
            "reviewedAt" = CURRENT_TIMESTAMP, "reviewNotes" = ${notes},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${reviewId} AND "status" = 'PENDING'
      `;
      await tx.aluno.update({
        where: { id: alunoId },
        data: { parqRequiresProfessionalReview: await pendingReviewExists(tx, contractId, alunoId) },
      });
      await recordEvent(tx, {
        alunoId,
        contractId,
        actorProfessorId: professorId,
        eventType: 'PARQ_REVIEWED',
        metadata: { reviewId, hasNotes: Boolean(notes) },
      });
      const submissions = (await readSubmissionRows(tx, contractId, alunoId)).map(mapSubmission);
      const session = await buildSession(tx, contractId, alunoId);
      return { state: session.status, latestSubmission: submissions[0] ?? null, submissions, legacy: session.legacy };
    });
  },
};

export function legacyParqWriteDisabled(): never {
  throw new ParqServiceError(
    'Novas respostas do PAR-Q devem ser registradas pelo fluxo autenticado do questionário.',
    'LEGACY_WRITE_DISABLED'
  );
}
