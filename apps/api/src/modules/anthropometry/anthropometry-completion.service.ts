import { Prisma, PrismaClient } from '@prisma/client';
import { canProfessorAccessScreen } from '../access-control/access-control.service.js';
import {
  appendAnthropometryTimelineEvent,
  listSegmentRequirements,
  markAssessmentCompleted,
} from './anthropometry-lifecycle.js';
import { AnthropometryDomainError, anthropometryService } from './anthropometry.service.js';

type ActorContext = {
  userId: string;
  professorId?: string | null;
};

type CompletionRequirement = {
  segmentId: string;
  version: number;
};

type CompletionSegment = {
  id: string;
  name: string;
  active: boolean;
};

type CompletionValue = {
  segmentId: string;
  value?: string | null;
};

type LockedLifecycle = {
  status: 'DRAFT' | 'COMPLETED';
};

const prisma = new PrismaClient();

export class AnthropometryCompletionAccessError extends Error {
  readonly code = 'COMPLETION_FORBIDDEN';

  constructor() {
    super('Perfil sem permissão para concluir avaliação antropométrica.');
    this.name = 'AnthropometryCompletionAccessError';
  }
}

export function evaluateAnthropometryCompletionRequirements(
  requirements: CompletionRequirement[],
  segments: CompletionSegment[],
  values: CompletionValue[]
) {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const valueBySegment = new Map(values.map((value) => [value.segmentId, value]));

  return requirements
    .filter((requirement) => {
      const segment = segmentById.get(requirement.segmentId);
      const value = valueBySegment.get(requirement.segmentId)?.value;
      return !segment?.active || !value?.trim();
    })
    .map((requirement) => ({
      segmentId: requirement.segmentId,
      name: segmentById.get(requirement.segmentId)?.name ?? requirement.segmentId,
    }));
}

export function buildAnthropometryCompletionSnapshot(
  requirements: CompletionRequirement[],
  segments: CompletionSegment[],
  capturedAt: string
): Prisma.InputJsonValue {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  return {
    legacy: false,
    configurationDefined: true,
    capturedAt,
    requiredSegments: requirements.map((requirement) => ({
      segmentId: requirement.segmentId,
      name: segmentById.get(requirement.segmentId)?.name ?? requirement.segmentId,
      requirementVersion: requirement.version,
    })),
  };
}

async function assertCompletionAccess(
  tx: Prisma.TransactionClient,
  contractId: string,
  professorId?: string | null
) {
  if (!professorId) throw new AnthropometryCompletionAccessError();

  const professor = await tx.professor.findFirst({
    where: { id: professorId, contractId },
    select: {
      role: true,
      collaboratorFunction: { select: { id: true, code: true } },
    },
  });

  if (!professor || !(await canProfessorAccessScreen(professor, 'physicalAssessment.protocol', tx))) {
    throw new AnthropometryCompletionAccessError();
  }
}

async function lockLifecycleForCompletion(
  tx: Prisma.TransactionClient,
  contractId: string,
  assessmentId: string
): Promise<LockedLifecycle> {
  const rows = await tx.$queryRaw<LockedLifecycle[]>(Prisma.sql`
    SELECT "status"
    FROM "AnthropometryAssessmentLifecycle"
    WHERE "assessmentId" = ${assessmentId}
      AND "contractId" = ${contractId}
    FOR UPDATE
  `);
  const lifecycle = rows[0];
  if (!lifecycle) throw new Error('Estado da avaliação antropométrica não encontrado');
  return lifecycle;
}

export async function completeAnthropometrySecurely(
  contractId: string,
  assessmentId: string,
  actor: ActorContext
) {
  const completedId = await prisma.$transaction(async (tx) => {
    await assertCompletionAccess(tx, contractId, actor.professorId);

    const assessmentExists = await tx.anthropometryAssessment.findFirst({
      where: { id: assessmentId, contractId },
      select: { id: true },
    });
    if (!assessmentExists) throw new Error('Avaliação antropométrica não encontrada');

    // Lock the lifecycle row before reading mutable assessment data. The database mutation
    // guard takes the same row lock for ordinary writes, so completion and common editing
    // have a single serialization point and cannot cross the DRAFT -> COMPLETED boundary.
    const lifecycle = await lockLifecycleForCompletion(tx, contractId, assessmentId);
    if (lifecycle.status === 'COMPLETED') {
      throw new AnthropometryDomainError(
        'ASSESSMENT_COMPLETED',
        'A avaliação concluída é imutável. Use o fluxo de correção auditada.'
      );
    }

    const assessment = await tx.anthropometryAssessment.findFirst({
      where: { id: assessmentId, contractId },
      include: {
        values: { select: { segmentId: true, value: true } },
      },
    });
    if (!assessment) throw new Error('Avaliação antropométrica não encontrada');

    const requirements = (await listSegmentRequirements(contractId, tx)).filter((item) => item.isRequired);
    if (!requirements.length) {
      throw new AnthropometryDomainError(
        'COMPLETION_CONFIGURATION_MISSING',
        'Defina explicitamente ao menos uma medida obrigatória antes de concluir avaliações.'
      );
    }

    const segments = await tx.anthropometrySegment.findMany({
      where: { contractId, id: { in: requirements.map((item) => item.segmentId) } },
      select: { id: true, name: true, active: true },
    });
    const missing = evaluateAnthropometryCompletionRequirements(requirements, segments, assessment.values);
    if (missing.length) {
      throw new AnthropometryDomainError(
        'REQUIRED_MEASURES_MISSING',
        'Preencha todas as medidas configuradas como obrigatórias antes de concluir.',
        { missing }
      );
    }

    const snapshot = buildAnthropometryCompletionSnapshot(
      requirements,
      segments,
      new Date().toISOString()
    );
    const changed = await markAssessmentCompleted(assessment.id, contractId, actor.userId, snapshot, tx);
    if (!changed) {
      throw new AnthropometryDomainError(
        'CONCURRENT_COMPLETION',
        'A avaliação já foi concluída em outra operação.'
      );
    }

    await appendAnthropometryTimelineEvent({
      alunoId: assessment.alunoId,
      contractId,
      actorUserId: actor.userId,
      actorProfessorId: actor.professorId,
      eventKey: `anthropometry:${assessment.id}:completed`,
      action: 'completed',
      assessmentId: assessment.id,
      assessmentCode: assessment.code,
    }, tx);

    return assessment.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return anthropometryService.getAssessment(contractId, completedId);
}
