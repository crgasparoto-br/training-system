import { Prisma, PrismaClient } from '@prisma/client';
import type { PreRegistrationReadyForEnrollmentInputDTO } from '@corrida/types';
import {
  buildProfessorDataScopeWhere,
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import {
  findMissingPreRegistrationFields,
} from '../alunos/student-lifecycle.service.js';
import {
  hasCurrentPreRegistrationConsent,
} from '../alunos/student-lifecycle-enrollment.service.js';
import { loadStudentIdentity } from '../alunos/student-identity.service.js';
import {
  detectPreRegistrationDuplicates,
  PreRegistrationEnrollmentError,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';

const prisma = new PrismaClient();
const REVIEW_BLOCK = 'students.preRegistration.review';
type DetectionResult = Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>;
type EventMetadata = Record<string, unknown>;

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataOf(value: Prisma.JsonValue | null): EventMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as EventMetadata;
}

async function assertReviewAccess(
  tx: Prisma.TransactionClient,
  actor: PreRegistrationEnrollmentActor,
  aluno: { professorId: string | null; createdByProfessorId: string | null }
): Promise<void> {
  const professor = await tx.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    select: {
      id: true,
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });
  if (!professor?.collaboratorFunction) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }

  const principal = {
    role: professor.role as 'master' | 'professor',
    collaboratorFunction: professor.collaboratorFunction,
  };
  const [scope, canReview] = await Promise.all([
    getEffectiveDataScopeForProfessor(principal, 'students.preRegistration', tx),
    canProfessorAccessBlock(principal, REVIEW_BLOCK, tx),
  ]);
  if (!scope || !canReview) {
    throw new PreRegistrationEnrollmentError('Acesso não autorizado.', 'FORBIDDEN');
  }
  if (scope === 'contract') return;

  const visible = await tx.professor.findMany({
    where: buildProfessorDataScopeWhere(actor.contractId, actor.professorId, scope),
    select: { id: true },
  });
  const visibleIds = new Set(visible.map(({ id }) => id));
  if (
    !(aluno.professorId && visibleIds.has(aluno.professorId)) &&
    !(aluno.createdByProfessorId && visibleIds.has(aluno.createdByProfessorId))
  ) {
    throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
  }
}

async function validDuplicateDecision(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  detection: DetectionResult
): Promise<'NO_DUPLICATE' | 'CONFIRM_DIFFERENT'> {
  if (detection.classification === 'NONE' || detection.classification === 'INFORMATIONAL') {
    return 'NO_DUPLICATE';
  }
  if (detection.classification === 'BLOCKING') {
    throw new PreRegistrationEnrollmentError(
      'Existe duplicidade bloqueante sem resolução administrativa.',
      'BLOCKING_DUPLICATE'
    );
  }

  const events = await tx.studentLifecycleEvent.findMany({
    where: { alunoId, contractId, eventType: 'ADMIN_REVIEWED' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { metadata: true },
  });
  const now = Date.now();
  const decision = events.map(({ metadata }) => metadataOf(metadata)).find((metadata) =>
    metadata.kind === 'DEDUPLICATION_DECISION' &&
    metadata.action === 'CONFIRM_DIFFERENT' &&
    metadata.fingerprint === detection.fingerprint &&
    Number(metadata.reviewedRecordVersion) === detection.recordVersion &&
    typeof metadata.validUntil === 'string' &&
    new Date(metadata.validUntil).getTime() > now
  );
  if (!decision) {
    throw new PreRegistrationEnrollmentError(
      'Existe duplicidade sem decisão administrativa vigente.',
      'DUPLICATE_REVIEW_REQUIRED'
    );
  }
  return 'CONFIRM_DIFFERENT';
}

export const preRegistrationReadyReviewService = {
  async refresh(
    actor: PreRegistrationEnrollmentActor,
    alunoId: string,
    input: PreRegistrationReadyForEnrollmentInputDTO
  ): Promise<void> {
    const reason = clean(input.reason);
    if (!reason) {
      throw new PreRegistrationEnrollmentError('Informe o motivo da revisão.', 'INVALID_INPUT');
    }

    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Aluno"
        WHERE "id" = ${alunoId} AND "contractId" = ${actor.contractId}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
      }

      const aluno = await tx.aluno.findFirst({
        where: { id: alunoId, contractId: actor.contractId },
        include: { onboarding: true },
      });
      if (!aluno || !aluno.onboarding) {
        throw new PreRegistrationEnrollmentError('Pré-matrícula não encontrada.', 'NOT_FOUND');
      }
      await assertReviewAccess(tx, actor, aluno);
      if (aluno.status !== 'READY_FOR_ENROLLMENT') {
        throw new PreRegistrationEnrollmentError(
          'Somente uma matrícula pronta com revisão desatualizada pode renovar a revisão.',
          'PRECONDITION_FAILED'
        );
      }

      const detection = await detectPreRegistrationDuplicates(tx, {
        contractId: actor.contractId,
        alunoId,
      });
      if (
        detection.recordVersion !== input.expectedVersion ||
        detection.fingerprint !== input.fingerprint
      ) {
        throw new PreRegistrationEnrollmentError(
          'Os dados ou as evidências mudaram. Refaça a revisão.',
          'REVIEW_STALE',
          {
            currentVersion: detection.recordVersion,
            currentFingerprint: detection.fingerprint,
          }
        );
      }
      const decisionAction = await validDuplicateDecision(
        tx,
        alunoId,
        actor.contractId,
        detection
      );

      if (
        !hasCurrentPreRegistrationConsent(
          aluno.onboarding.privacyNoticeVersion,
          aluno.onboarding.privacyAcceptedAt
        )
      ) {
        throw new PreRegistrationEnrollmentError(
          'O consentimento vigente deve estar registrado antes da revisão.',
          'PRECONDITION_FAILED'
        );
      }
      const identity = await loadStudentIdentity(alunoId, actor.contractId, tx);
      const missing = findMissingPreRegistrationFields({
        name: identity.name ?? undefined,
        phone: identity.phone ?? undefined,
        email: identity.email ?? undefined,
        birthDate: identity.birthDate ?? undefined,
        privacyNoticeVersion: aluno.onboarding.privacyNoticeVersion ?? undefined,
        privacyAcceptedAt: aluno.onboarding.privacyAcceptedAt ?? undefined,
      });
      if (missing.length > 0) {
        throw new PreRegistrationEnrollmentError(
          'O cadastro ainda possui campos obrigatórios pendentes.',
          'PRECONDITION_FAILED',
          { fields: missing }
        );
      }

      const updated = await tx.studentOnboardingProcess.updateMany({
        where: {
          alunoId,
          contractId: actor.contractId,
          version: input.expectedVersion,
        },
        data: {
          reviewedAt: new Date(),
          reviewedByProfessorId: actor.professorId,
        },
      });
      if (updated.count !== 1) {
        throw new PreRegistrationEnrollmentError(
          'Os dados foram alterados. Refaça a revisão.',
          'CONCURRENT_MODIFICATION'
        );
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId: actor.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: {
            kind: 'ENROLLMENT_REVIEW',
            reason,
            fingerprint: detection.fingerprint,
            reviewedRecordVersion: detection.recordVersion,
            decisionAction,
            reviewRefreshed: true,
            from: 'READY_FOR_ENROLLMENT',
            to: 'READY_FOR_ENROLLMENT',
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
};
