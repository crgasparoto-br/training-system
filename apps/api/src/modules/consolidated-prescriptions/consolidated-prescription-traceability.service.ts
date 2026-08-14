import { PrismaClient, type Prisma } from '@prisma/client';
import type { AccessDataScope } from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';

const prisma = new PrismaClient();
const CONSOLIDATED_VIEW_BLOCK = 'plans.consolidatedPrescriptions.view';

export type ConsolidatedTraceabilityLookup =
  | { workoutTemplateId: string; workoutDayId?: never; workoutExerciseId?: never }
  | { workoutTemplateId?: never; workoutDayId: string; workoutExerciseId?: never }
  | { workoutTemplateId?: never; workoutDayId?: never; workoutExerciseId: string };

export type ConsolidatedTraceabilityErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_INPUT';

export class ConsolidatedTraceabilityDomainError extends Error {
  constructor(
    public readonly code: ConsolidatedTraceabilityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ConsolidatedTraceabilityDomainError';
  }
}

type TraceabilityContext = {
  contractId: string;
  alunoId: string;
  actorProfessorId: string;
};

type OperationalTargetRow = {
  trainingPlanId: string;
  workoutTemplateId: string;
  workoutDayId: string | null;
  workoutExerciseId: string | null;
};

type ReleaseTraceRow = {
  id: string;
  assemblyId: string;
  sourceAssemblyVersionId: string;
  sourceAssemblyVersion: number;
  releasedAssemblyVersionId: string;
  releasedAssemblyVersion: number;
  trainingPlanId: string;
  workoutTemplateId: string;
  releasedByProfessorId: string;
  releasedAt: Date;
};

type VersionStatusRow = {
  id: string;
  version: number;
  status: string;
};

type CapacityTraceRow = {
  capacityPrescriptionVersionId: string;
  capacity: string;
  capacityVersion: number;
  capacityStatus: string;
  position: number;
};

type DataRefTraceRow = {
  role: string;
  sourceType: string;
  sourceId: string;
  label: string | null;
  assessedAt: Date | null;
  origin: string | null;
  sourceVersion: string | null;
  responsibleProfessorId: string | null;
};

type OperationalCapacityBlockTraceRow = {
  id: string;
  workoutDayId: string;
  capacityPrescriptionVersionId: string;
  capacity: string;
  contractVersion: number;
  parameters: unknown;
  createdAt: Date;
};

function fail(code: ConsolidatedTraceabilityErrorCode, message: string): never {
  throw new ConsolidatedTraceabilityDomainError(code, message);
}

async function assertAlunoScope(
  tx: Prisma.TransactionClient,
  context: TraceabilityContext,
  scope: AccessDataScope
) {
  const aluno = await tx.aluno.findFirst({
    where: { id: context.alunoId, contractId: context.contractId },
    select: { id: true, professorId: true },
  });
  if (!aluno) fail('NOT_FOUND', 'Recurso não encontrado');
  if (scope === 'contract' || aluno.professorId === context.actorProfessorId) return;
  if (scope !== 'managed' || !aluno.professorId) fail('NOT_FOUND', 'Recurso não encontrado');

  const responsible = await tx.professor.findFirst({
    where: { id: aluno.professorId, contractId: context.contractId },
    select: { responsibleManagerId: true },
  });
  if (responsible?.responsibleManagerId !== context.actorProfessorId) {
    fail('NOT_FOUND', 'Recurso não encontrado');
  }
}

async function assertReadAuthority(tx: Prisma.TransactionClient, context: TraceabilityContext) {
  const professor = await tx.professor.findFirst({
    where: { id: context.actorProfessorId, contractId: context.contractId },
    include: { collaboratorFunction: true },
  });
  if (!professor) fail('FORBIDDEN', 'Perfil sem permissão para consultar a rastreabilidade');
  if (!(await canProfessorAccessBlock(professor, CONSOLIDATED_VIEW_BLOCK, tx))) {
    fail('FORBIDDEN', 'Perfil sem permissão para consultar a rastreabilidade');
  }
  const scope = await getEffectiveDataScopeForProfessor(professor, 'plans', tx);
  if (!scope) fail('FORBIDDEN', 'Perfil sem permissão para consultar a rastreabilidade');
  await assertAlunoScope(tx, context, scope);
}

function assertSingleLookup(lookup: ConsolidatedTraceabilityLookup) {
  const values = [lookup.workoutTemplateId, lookup.workoutDayId, lookup.workoutExerciseId].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  if (values.length !== 1) fail('INVALID_INPUT', 'Informe exatamente um ID operacional para rastreabilidade');
}

async function resolveOperationalTarget(
  tx: Prisma.TransactionClient,
  context: TraceabilityContext,
  lookup: ConsolidatedTraceabilityLookup
): Promise<OperationalTargetRow> {
  if (lookup.workoutTemplateId) {
    const rows = await tx.$queryRaw<OperationalTargetRow[]>`
      SELECT tp."id" AS "trainingPlanId",
             wt."id" AS "workoutTemplateId",
             NULL::text AS "workoutDayId",
             NULL::text AS "workoutExerciseId"
      FROM "WorkoutTemplate" wt
      JOIN "TrainingPlan" tp ON tp."id" = wt."planId"
      JOIN "Aluno" a ON a."id" = tp."alunoId"
      JOIN "Professor" p ON p."id" = tp."professorId"
      WHERE wt."id" = ${lookup.workoutTemplateId.trim()}
        AND tp."alunoId" = ${context.alunoId}
        AND a."contractId" = ${context.contractId}
        AND p."contractId" = ${context.contractId}
      LIMIT 1
    `;
    if (!rows[0]) fail('NOT_FOUND', 'Recurso não encontrado');
    return rows[0];
  }

  if (lookup.workoutDayId) {
    const rows = await tx.$queryRaw<OperationalTargetRow[]>`
      SELECT tp."id" AS "trainingPlanId",
             wt."id" AS "workoutTemplateId",
             wd."id" AS "workoutDayId",
             NULL::text AS "workoutExerciseId"
      FROM "WorkoutDay" wd
      JOIN "WorkoutTemplate" wt ON wt."id" = wd."templateId"
      JOIN "TrainingPlan" tp ON tp."id" = wt."planId"
      JOIN "Aluno" a ON a."id" = tp."alunoId"
      JOIN "Professor" p ON p."id" = tp."professorId"
      WHERE wd."id" = ${lookup.workoutDayId.trim()}
        AND tp."alunoId" = ${context.alunoId}
        AND a."contractId" = ${context.contractId}
        AND p."contractId" = ${context.contractId}
      LIMIT 1
    `;
    if (!rows[0]) fail('NOT_FOUND', 'Recurso não encontrado');
    return rows[0];
  }

  if (lookup.workoutExerciseId) {
    const rows = await tx.$queryRaw<OperationalTargetRow[]>`
      SELECT tp."id" AS "trainingPlanId",
             wt."id" AS "workoutTemplateId",
             wd."id" AS "workoutDayId",
             we."id" AS "workoutExerciseId"
      FROM "WorkoutExercise" we
      JOIN "WorkoutDay" wd ON wd."id" = we."workoutDayId"
      JOIN "WorkoutTemplate" wt ON wt."id" = wd."templateId"
      JOIN "TrainingPlan" tp ON tp."id" = wt."planId"
      JOIN "Aluno" a ON a."id" = tp."alunoId"
      JOIN "Professor" p ON p."id" = tp."professorId"
      WHERE we."id" = ${lookup.workoutExerciseId.trim()}
        AND tp."alunoId" = ${context.alunoId}
        AND a."contractId" = ${context.contractId}
        AND p."contractId" = ${context.contractId}
      LIMIT 1
    `;
    if (!rows[0]) fail('NOT_FOUND', 'Recurso não encontrado');
    return rows[0];
  }

  fail('INVALID_INPUT', 'Informe exatamente um ID operacional para rastreabilidade');
}

async function loadOperationalCapacityBlocks(
  tx: Prisma.TransactionClient,
  operational: OperationalTargetRow
) {
  if (operational.workoutDayId) {
    return tx.$queryRaw<OperationalCapacityBlockTraceRow[]>`
      SELECT "id", "workoutDayId", "capacityPrescriptionVersionId", "capacity",
             "contractVersion", "parameters", "createdAt"
      FROM "WorkoutDayCapacityOperationalBlock"
      WHERE "workoutDayId" = ${operational.workoutDayId}
      ORDER BY "capacity" ASC
    `;
  }

  return tx.$queryRaw<OperationalCapacityBlockTraceRow[]>`
    SELECT block."id", block."workoutDayId", block."capacityPrescriptionVersionId", block."capacity",
           block."contractVersion", block."parameters", block."createdAt"
    FROM "WorkoutDayCapacityOperationalBlock" block
    JOIN "WorkoutDay" wd ON wd."id" = block."workoutDayId"
    WHERE wd."templateId" = ${operational.workoutTemplateId}
    ORDER BY wd."dayOfWeek" ASC, block."capacity" ASC
  `;
}

export function createConsolidatedPrescriptionTraceabilityService(client: PrismaClient = prisma) {
  return {
    async getTraceability(context: TraceabilityContext, lookup: ConsolidatedTraceabilityLookup) {
      assertSingleLookup(lookup);
      return client.$transaction(async (tx) => {
        await assertReadAuthority(tx, context);
        const operational = await resolveOperationalTarget(tx, context, lookup);

        const releases = await tx.$queryRaw<ReleaseTraceRow[]>`
          SELECT "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
                 "releasedAssemblyVersionId", "releasedAssemblyVersion", "trainingPlanId",
                 "workoutTemplateId", "releasedByProfessorId", "releasedAt"
          FROM "ConsolidatedPrescriptionOperationalRelease"
          WHERE "workoutTemplateId" = ${operational.workoutTemplateId}
            AND "trainingPlanId" = ${operational.trainingPlanId}
            AND "contractId" = ${context.contractId}
            AND "alunoId" = ${context.alunoId}
          LIMIT 1
        `;
        const release = releases[0];
        if (!release) fail('NOT_FOUND', 'Recurso não encontrado');

        const sourceVersions = await tx.$queryRaw<VersionStatusRow[]>`
          SELECT "id", "version", "status"
          FROM "ConsolidatedPrescriptionVersion"
          WHERE "id" = ${release.sourceAssemblyVersionId}
            AND "assemblyId" = ${release.assemblyId}
            AND "contractId" = ${context.contractId}
            AND "alunoId" = ${context.alunoId}
          LIMIT 1
        `;
        const releasedVersions = await tx.$queryRaw<VersionStatusRow[]>`
          SELECT "id", "version", "status"
          FROM "ConsolidatedPrescriptionVersion"
          WHERE "id" = ${release.releasedAssemblyVersionId}
            AND "assemblyId" = ${release.assemblyId}
            AND "contractId" = ${context.contractId}
            AND "alunoId" = ${context.alunoId}
          LIMIT 1
        `;
        const sourceVersion = sourceVersions[0];
        const releasedVersion = releasedVersions[0];
        if (!sourceVersion || !releasedVersion) fail('NOT_FOUND', 'Recurso não encontrado');

        const capacities = await tx.$queryRaw<CapacityTraceRow[]>`
          SELECT "capacityPrescriptionVersionId", "capacity", "capacityVersion", "capacityStatus", "position"
          FROM "ConsolidatedPrescriptionCapacityBlock"
          WHERE "assemblyVersionId" = ${release.sourceAssemblyVersionId}
            AND "contractId" = ${context.contractId}
            AND "alunoId" = ${context.alunoId}
          ORDER BY "position" ASC
        `;
        const sourceRefs = await tx.$queryRaw<DataRefTraceRow[]>`
          SELECT "role", "sourceType", "sourceId", "label", "assessedAt", "origin",
                 "sourceVersion", "responsibleProfessorId"
          FROM "ConsolidatedPrescriptionDataRef"
          WHERE "assemblyVersionId" = ${release.sourceAssemblyVersionId}
          ORDER BY "createdAt" ASC, "id" ASC
        `;
        const operationalCapacityBlocks = await loadOperationalCapacityBlocks(tx, operational);

        return {
          operational,
          release: {
            releaseId: release.id,
            trainingPlanId: release.trainingPlanId,
            workoutTemplateId: release.workoutTemplateId,
            releasedByProfessorId: release.releasedByProfessorId,
            releasedAt: release.releasedAt.toISOString(),
          },
          consolidatedPrescription: {
            assemblyId: release.assemblyId,
            sourceVersion: {
              id: sourceVersion.id,
              version: sourceVersion.version,
              status: sourceVersion.status,
            },
            releasedVersion: {
              id: releasedVersion.id,
              version: releasedVersion.version,
              status: releasedVersion.status,
            },
          },
          capacities,
          operationalCapacityBlocks: operationalCapacityBlocks.map((block) => ({
            ...block,
            createdAt: block.createdAt.toISOString(),
          })),
          sourceRefs: sourceRefs.map((ref) => ({
            ...ref,
            assessedAt: ref.assessedAt?.toISOString() ?? null,
          })),
        };
      });
    },
  };
}

export const consolidatedPrescriptionTraceabilityService =
  createConsolidatedPrescriptionTraceabilityService();
