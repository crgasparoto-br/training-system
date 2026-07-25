import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CompleteParqDTO,
  ParqErrorCode,
  ParqFlowStatus,
  ParqResponses,
  SaveParqDraftDTO,
} from '@corrida/types';
import { PARQ_CATALOG_VERSION } from '@corrida/types';
import {
  evaluateParqResponses,
  getCanonicalParqCatalog,
  validateParqCatalogVersion,
  validateParqResponses,
} from './pre-registration-parq.domain.js';
import { lockAndAuthorizePreRegistrationProcess } from './pre-registration-public-atomic.service.js';

const prisma = new PrismaClient();
const NOTICE_VERSION =
  process.env.HEALTH_PRIVACY_NOTICE_VERSION?.trim() ||
  process.env.PRIVACY_NOTICE_VERSION?.trim() ||
  '2026-07';

type DraftRow = {
  id: string;
  alunoId: string;
  contractId: string;
  catalogVersion: string;
  responses: Prisma.JsonValue;
  version: number;
  consentNoticeVersion: string;
  consentAcceptedAt: Date;
  lastSavedAt: Date;
};

type SubmissionRow = {
  id: string;
  alunoId: string;
  contractId: string;
  catalogVersion: string | null;
  responses: Prisma.JsonValue;
  positiveItems: Prisma.JsonValue | null;
  positiveCount: number | null;
  declarationAccepted: boolean;
  submittedAt: Date;
  idempotencyKey: string | null;
};

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

function requireConsent(input: SaveParqDraftDTO) {
  if (!input.consent?.accepted) {
    throw new ParqServiceError(
      'Leia e aceite o aviso de privacidade antes de salvar informações de saúde.',
      'CONSENT_REQUIRED'
    );
  }
  if (input.consent.privacyNoticeVersion !== NOTICE_VERSION) {
    throw new ParqServiceError(
      'O aviso de privacidade foi atualizado. Revise a versão atual antes de continuar.',
      'CONSENT_VERSION_MISMATCH',
      { requiredVersion: NOTICE_VERSION }
    );
  }
}

function statusOf(latest: SubmissionRow | undefined, draft: DraftRow | undefined, legacyExists: boolean): ParqFlowStatus {
  if (latest) {
    return (latest.positiveCount ?? 0) > 0 ? 'COMPLETED_REVIEW_REQUIRED' : 'COMPLETED_NO_ALERT';
  }
  if (draft) return 'IN_PROGRESS';
  return legacyExists ? 'NEEDS_REPEAT' : 'NOT_STARTED';
}

async function readDraft(tx: Prisma.TransactionClient, alunoId: string): Promise<DraftRow | undefined> {
  const rows = await tx.$queryRaw<DraftRow[]>`
    SELECT "id", "alunoId", "contractId", "catalogVersion", "responses", "version",
           "consentNoticeVersion", "consentAcceptedAt", "lastSavedAt"
    FROM "StudentParqDraft"
    WHERE "alunoId" = ${alunoId}
    LIMIT 1
  `;
  return rows[0];
}

async function readLatestSubmission(tx: Prisma.TransactionClient, alunoId: string): Promise<SubmissionRow | undefined> {
  const rows = await tx.$queryRaw<SubmissionRow[]>`
    SELECT "id", "alunoId", "contractId", "catalogVersion", "responses", "positiveItems",
           "positiveCount", "declarationAccepted", "submittedAt", "idempotencyKey"
    FROM "StudentParqSubmission"
    WHERE "alunoId" = ${alunoId}
    ORDER BY "submittedAt" DESC, "createdAt" DESC, "id" DESC
    LIMIT 1
  `;
  return rows[0];
}

async function hasIncompatibleLegacy(tx: Prisma.TransactionClient, alunoId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "AlunoIntakeForm" WHERE "alunoId" = ${alunoId} AND "parqResponses" IS NOT NULL
      UNION ALL
      SELECT 1 FROM "StudentHealthIntake" WHERE "alunoId" = ${alunoId} AND "questionnaireParq" IS NOT NULL
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function buildSession(tx: Prisma.TransactionClient, alunoId: string) {
  const [draft, latest, legacyExists] = await Promise.all([
    readDraft(tx, alunoId),
    readLatestSubmission(tx, alunoId),
    hasIncompatibleLegacy(tx, alunoId),
  ]);
  return {
    alunoId,
    catalog: getCanonicalParqCatalog(),
    status: statusOf(latest, draft, legacyExists),
    version: draft?.version ?? 1,
    responses: draft ? responseRecord(draft.responses) : {},
    consent: {
      requiredVersion: NOTICE_VERSION,
      acceptedVersion: draft?.consentNoticeVersion,
      acceptedAt: draft?.consentAcceptedAt?.toISOString(),
    },
    lastSavedAt: draft?.lastSavedAt?.toISOString(),
    latestSubmission: latest
      ? {
          id: latest.id,
          catalogVersion: latest.catalogVersion,
          submittedAt: latest.submittedAt.toISOString(),
          positiveCount: latest.positiveCount ?? 0,
        }
      : undefined,
  };
}

export const preRegistrationParqService = {
  async getSession(userId: string, alunoId: string) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.status !== 'PRE_REGISTRATION_COMPLETED') {
        throw new ParqServiceError(
          'Conclua primeiro os dados básicos do pré-cadastro.',
          'BASIC_PRE_REGISTRATION_REQUIRED'
        );
      }
      return buildSession(tx, alunoId);
    });
  },

  async saveDraft(userId: string, alunoId: string, input: SaveParqDraftDTO) {
    validateParqCatalogVersion(input.catalogVersion);
    validateParqResponses(input.responses, false);
    requireConsent(input);

    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.status !== 'PRE_REGISTRATION_COMPLETED') {
        throw new ParqServiceError(
          'Conclua primeiro os dados básicos do pré-cadastro.',
          'BASIC_PRE_REGISTRATION_REQUIRED'
        );
      }
      const existing = await readDraft(tx, alunoId);
      if (input.expectedVersion !== (existing?.version ?? 1)) {
        throw new ParqServiceError(
          'Este PAR-Q foi alterado em outro acesso. Recarregue antes de continuar.',
          'CONCURRENT_MODIFICATION',
          { currentVersion: existing?.version ?? 1 }
        );
      }
      const id = existing?.id ?? crypto.randomUUID();
      const nextVersion = existing ? existing.version + 1 : 1;
      await tx.$executeRaw`
        INSERT INTO "StudentParqDraft" (
          "id", "alunoId", "contractId", "catalogVersion", "responses", "version",
          "consentNoticeVersion", "consentAcceptedAt", "consentAcceptedByUserId",
          "lastSavedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${alunoId}, ${access.contractId}, ${PARQ_CATALOG_VERSION},
          ${JSON.stringify(input.responses)}::jsonb, ${nextVersion}, ${NOTICE_VERSION},
          CURRENT_TIMESTAMP, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("alunoId") DO UPDATE SET
          "catalogVersion" = EXCLUDED."catalogVersion",
          "responses" = EXCLUDED."responses",
          "version" = EXCLUDED."version",
          "consentNoticeVersion" = EXCLUDED."consentNoticeVersion",
          "consentAcceptedAt" = EXCLUDED."consentAcceptedAt",
          "consentAcceptedByUserId" = EXCLUDED."consentAcceptedByUserId",
          "lastSavedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      `;
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: { parqModuleStatus: 'IN_PROGRESS', lastSavedAt: new Date() },
      });
      return buildSession(tx, alunoId);
    });
  },

  async complete(userId: string, alunoId: string, input: CompleteParqDTO) {
    validateParqCatalogVersion(input.catalogVersion);
    validateParqResponses(input.responses, true);
    requireConsent(input);
    if (!input.declarationAccepted) {
      throw new ParqServiceError('Confirme a declaração antes de concluir.', 'INCOMPLETE_RESPONSES');
    }
    const evaluation = evaluateParqResponses(input.responses);

    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.status !== 'PRE_REGISTRATION_COMPLETED') {
        throw new ParqServiceError(
          'Conclua primeiro os dados básicos do pré-cadastro.',
          'BASIC_PRE_REGISTRATION_REQUIRED'
        );
      }
      const repeated = await tx.$queryRaw<SubmissionRow[]>`
        SELECT "id", "alunoId", "contractId", "catalogVersion", "responses", "positiveItems",
               "positiveCount", "declarationAccepted", "submittedAt", "idempotencyKey"
        FROM "StudentParqSubmission"
        WHERE "alunoId" = ${alunoId} AND "idempotencyKey" = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (repeated[0]) return buildSession(tx, alunoId);

      const draft = await readDraft(tx, alunoId);
      if (input.expectedVersion !== (draft?.version ?? 1)) {
        throw new ParqServiceError(
          'Este PAR-Q foi alterado em outro acesso. Recarregue antes de concluir.',
          'CONCURRENT_MODIFICATION',
          { currentVersion: draft?.version ?? 1 }
        );
      }

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
            "id", "submissionId", "alunoId", "contractId", "status", "positiveCount",
            "positiveItems", "createdAt", "updatedAt"
          ) VALUES (
            ${crypto.randomUUID()}, ${submissionId}, ${alunoId}, ${access.contractId}, 'PENDING',
            ${evaluation.positiveCount}, ${JSON.stringify(evaluation.positiveItems)}::jsonb,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `;
      }

      await tx.$executeRaw`DELETE FROM "StudentParqDraft" WHERE "alunoId" = ${alunoId}`;
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: { parqModuleStatus: 'COMPLETED', lastSavedAt: new Date() },
      });
      await tx.aluno.update({
        where: { id: alunoId },
        data: { parqRequiresProfessionalReview: evaluation.positiveCount > 0 },
      });
      return buildSession(tx, alunoId);
    });
  },
};
