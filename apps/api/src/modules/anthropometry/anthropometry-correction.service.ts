import { Prisma, PrismaClient } from '@prisma/client';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import {
  appendAnthropometryTimelineEvent,
  getAssessmentLifecycle,
  insertCorrectionAudit,
} from './anthropometry-lifecycle.js';
import { AnthropometryDomainError, anthropometryService } from './anthropometry.service.js';

type CorrectionInput = {
  reason: string;
  values?: Array<{ segmentId: string; value?: string | null; unit?: string | null; observation?: string | null }>;
  notes?: string | null;
  observations?: Array<{ segmentId?: string | null; text: string; importable?: boolean }>;
};

type ActorContext = {
  userId: string;
  professorId?: string | null;
};

const prisma = new PrismaClient();

export class AnthropometryCorrectionAccessError extends Error {
  readonly code = 'CORRECTION_FORBIDDEN';

  constructor() {
    super('Perfil sem permissão para corrigir avaliação concluída.');
    this.name = 'AnthropometryCorrectionAccessError';
  }
}

const includeAssessment = {
  professor: { include: { user: { include: { profile: true } } } },
  values: { include: { segment: true }, orderBy: { segment: { order: 'asc' as const } } },
  observations: { include: { segment: true }, orderBy: { createdAt: 'asc' as const } },
};

function snapshotAssessment(assessment: {
  notes?: string | null;
  values: Array<{ segmentId: string; value?: string | null; unit?: string | null; observation?: string | null }>;
  observations: Array<{ segmentId?: string | null; text: string; importable: boolean }>;
}) {
  return {
    notes: assessment.notes ?? null,
    values: assessment.values.map((item) => ({
      segmentId: item.segmentId,
      value: item.value ?? null,
      unit: item.unit ?? 'cm',
      observation: item.observation ?? null,
    })),
    observations: assessment.observations.map((item) => ({
      segmentId: item.segmentId ?? null,
      text: item.text,
      importable: item.importable,
    })),
  };
}

async function assertSegmentsInContract(
  client: Prisma.TransactionClient,
  contractId: string,
  segmentIds: string[]
) {
  const uniqueIds = [...new Set(segmentIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const segments = await client.anthropometrySegment.findMany({
    where: { contractId, id: { in: uniqueIds } },
    select: { id: true },
  });
  if (segments.length !== uniqueIds.length) {
    throw new AnthropometryDomainError('INVALID_SEGMENT', 'Segmento antropométrico inválido para este contrato.');
  }
}

async function assertCorrectionAccess(
  client: Prisma.TransactionClient,
  contractId: string,
  professorId?: string | null
) {
  if (!professorId) throw new AnthropometryCorrectionAccessError();

  const professor = await client.professor.findFirst({
    where: { id: professorId, contractId },
    select: {
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });
  if (!professor || !(await canProfessorAccessBlock(professor, 'students.actions.manageAssessments', client))) {
    throw new AnthropometryCorrectionAccessError();
  }
}

export async function correctCompletedAnthropometry(
  contractId: string,
  assessmentId: string,
  actor: ActorContext,
  data: CorrectionInput
) {
  const reason = data.reason.trim();
  if (!reason) {
    throw new AnthropometryDomainError('CORRECTION_REASON_REQUIRED', 'Informe o motivo da correção.');
  }

  const correctedId = await prisma.$transaction(async (tx) => {
    await assertCorrectionAccess(tx, contractId, actor.professorId);

    const assessment = await tx.anthropometryAssessment.findFirst({
      where: { id: assessmentId, contractId },
      include: includeAssessment,
    });
    if (!assessment) throw new Error('Avaliação antropométrica não encontrada');

    const lifecycle = await getAssessmentLifecycle(assessment.id, contractId, tx);
    if (lifecycle?.status !== 'COMPLETED') {
      throw new AnthropometryDomainError(
        'ASSESSMENT_NOT_COMPLETED',
        'Somente avaliações concluídas usam o fluxo de correção auditada.'
      );
    }

    if (data.values) {
      await assertSegmentsInContract(tx, contractId, data.values.map((item) => item.segmentId));
    }
    if (data.observations) {
      await assertSegmentsInContract(
        tx,
        contractId,
        data.observations.flatMap((item) => item.segmentId ? [item.segmentId] : [])
      );
    }

    const beforeSnapshot = snapshotAssessment(assessment);

    if (data.values) {
      for (const item of data.values) {
        await tx.anthropometryAssessmentValue.upsert({
          where: { assessmentId_segmentId: { assessmentId: assessment.id, segmentId: item.segmentId } },
          create: {
            assessmentId: assessment.id,
            segmentId: item.segmentId,
            value: item.value,
            unit: item.unit || 'cm',
            observation: item.observation,
          },
          update: {
            value: item.value,
            unit: item.unit || 'cm',
            observation: item.observation,
          },
        });
      }
    }
    if (data.notes !== undefined) {
      await tx.anthropometryAssessment.update({
        where: { id: assessment.id },
        data: { notes: data.notes },
      });
    }
    if (data.observations) {
      await tx.anthropometryObservation.deleteMany({ where: { assessmentId: assessment.id } });
      const observations = data.observations
        .filter((item) => item.text.trim())
        .map((item) => ({
          assessmentId: assessment.id,
          segmentId: item.segmentId || null,
          text: item.text.trim(),
          importable: item.importable ?? false,
        }));
      if (observations.length) await tx.anthropometryObservation.createMany({ data: observations });
    }

    const after = await tx.anthropometryAssessment.findUniqueOrThrow({
      where: { id: assessment.id },
      include: includeAssessment,
    });
    const afterSnapshot = snapshotAssessment(after);
    if (JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) {
      throw new AnthropometryDomainError(
        'CORRECTION_WITHOUT_CHANGES',
        'A correção não alterou nenhum dado da avaliação.'
      );
    }

    const correction = await insertCorrectionAudit({
      assessmentId: assessment.id,
      contractId,
      alunoId: assessment.alunoId,
      actorUserId: actor.userId,
      actorProfessorId: actor.professorId || null,
      reason,
      beforeSnapshot,
      afterSnapshot,
    }, tx);

    await appendAnthropometryTimelineEvent({
      alunoId: assessment.alunoId,
      contractId,
      actorUserId: actor.userId,
      actorProfessorId: actor.professorId,
      eventKey: `anthropometry:${assessment.id}:correction:${correction.id}`,
      action: 'corrected',
      assessmentId: assessment.id,
      assessmentCode: assessment.code,
      correctionId: correction.id,
    }, tx);

    return assessment.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return anthropometryService.getAssessment(contractId, correctedId);
}
