import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, type StudentLifecycleEventType } from '@prisma/client';

export type AnthropometryAssessmentStatus = 'DRAFT' | 'COMPLETED';

export type AnthropometrySegmentRequirement = {
  segmentId: string;
  contractId: string;
  isRequired: boolean;
  version: number;
  configuredAt: Date;
  updatedAt: Date;
};

export type AnthropometryLifecycleState = {
  assessmentId: string;
  contractId: string;
  alunoId: string;
  status: AnthropometryAssessmentStatus;
  completedAt: Date | null;
  completedByUserId: string | null;
  requirementsSnapshot: unknown | null;
};

export type AnthropometryCorrectionAudit = {
  id: string;
  assessmentId: string;
  contractId: string;
  alunoId: string;
  actorUserId: string | null;
  actorProfessorId: string | null;
  reason: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: Date;
};

export type AnthropometryVariation = {
  absolute: number;
  percentage: number | null;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

const prisma = new PrismaClient();

const roundVariation = (value: number) => Math.round(value * 10_000) / 10_000;

export function parseAnthropometryNumber(value?: string | null): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  const canonical = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateAnthropometryVariation(
  currentValue?: string | null,
  previousValue?: string | null,
  currentUnit?: string | null,
  previousUnit?: string | null
): AnthropometryVariation | null {
  if ((currentUnit || 'cm') !== (previousUnit || 'cm')) return null;
  const current = parseAnthropometryNumber(currentValue);
  const previous = parseAnthropometryNumber(previousValue);
  if (current == null || previous == null) return null;

  const absolute = roundVariation(current - previous);
  return {
    absolute,
    percentage: previous === 0 ? null : roundVariation((absolute / Math.abs(previous)) * 100),
  };
}

export function addAnthropometryVariations<
  T extends {
    id: string;
    assessmentDate: Date | string;
    createdAt: Date | string;
    values: Array<{
      segmentId: string;
      value?: string | null;
      unit?: string | null;
    }>;
  },
>(assessments: T[]) {
  const chronological = [...assessments].sort((left, right) => {
    const dateDelta = new Date(left.assessmentDate).getTime() - new Date(right.assessmentDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
  const enrichedById = new Map<string, T & { values: Array<T['values'][number] & { variationFromPrevious: AnthropometryVariation | null }> }>();

  chronological.forEach((assessment, index) => {
    const previous = index > 0 ? chronological[index - 1] : null;
    const previousValues = new Map(previous?.values.map((item) => [item.segmentId, item]) ?? []);
    enrichedById.set(assessment.id, {
      ...assessment,
      values: assessment.values.map((item) => {
        const previousValue = previousValues.get(item.segmentId);
        return {
          ...item,
          variationFromPrevious: previousValue
            ? calculateAnthropometryVariation(item.value, previousValue.value, item.unit, previousValue.unit)
            : null,
        };
      }),
    });
  });

  return assessments.map((assessment) => enrichedById.get(assessment.id)!);
}

export async function getSegmentRequirement(
  contractId: string,
  segmentId: string,
  client: DbClient = prisma
): Promise<AnthropometrySegmentRequirement | null> {
  const rows = await client.$queryRaw<AnthropometrySegmentRequirement[]>(Prisma.sql`
    SELECT "segmentId", "contractId", "isRequired", "version", "configuredAt", "updatedAt"
    FROM "AnthropometrySegmentCompletionRequirement"
    WHERE "segmentId" = ${segmentId} AND "contractId" = ${contractId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function listSegmentRequirements(
  contractId: string,
  client: DbClient = prisma
): Promise<AnthropometrySegmentRequirement[]> {
  return client.$queryRaw<AnthropometrySegmentRequirement[]>(Prisma.sql`
    SELECT "segmentId", "contractId", "isRequired", "version", "configuredAt", "updatedAt"
    FROM "AnthropometrySegmentCompletionRequirement"
    WHERE "contractId" = ${contractId}
    ORDER BY "segmentId" ASC
  `);
}

export async function setSegmentRequirement(
  contractId: string,
  segmentId: string,
  isRequired: boolean,
  client: DbClient = prisma
): Promise<AnthropometrySegmentRequirement> {
  const existing = await getSegmentRequirement(contractId, segmentId, client);
  if (!existing) {
    const inserted = await client.$queryRaw<AnthropometrySegmentRequirement[]>(Prisma.sql`
      INSERT INTO "AnthropometrySegmentCompletionRequirement"
        ("segmentId", "contractId", "isRequired", "version")
      VALUES (${segmentId}, ${contractId}, ${isRequired}, 1)
      RETURNING "segmentId", "contractId", "isRequired", "version", "configuredAt", "updatedAt"
    `);
    return inserted[0];
  }
  if (existing.isRequired === isRequired) return existing;

  const updated = await client.$queryRaw<AnthropometrySegmentRequirement[]>(Prisma.sql`
    UPDATE "AnthropometrySegmentCompletionRequirement"
    SET "isRequired" = ${isRequired}, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "segmentId" = ${segmentId} AND "contractId" = ${contractId}
    RETURNING "segmentId", "contractId", "isRequired", "version", "configuredAt", "updatedAt"
  `);
  return updated[0];
}

export async function ensureDraftLifecycle(
  assessmentId: string,
  contractId: string,
  alunoId: string,
  client: DbClient = prisma
) {
  await client.$executeRaw(Prisma.sql`
    INSERT INTO "AnthropometryAssessmentLifecycle"
      ("assessmentId", "contractId", "alunoId", "status")
    VALUES (${assessmentId}, ${contractId}, ${alunoId}, 'DRAFT')
    ON CONFLICT ("assessmentId") DO NOTHING
  `);
}

export async function getAssessmentLifecycle(
  assessmentId: string,
  contractId: string,
  client: DbClient = prisma
): Promise<AnthropometryLifecycleState | null> {
  const rows = await client.$queryRaw<AnthropometryLifecycleState[]>(Prisma.sql`
    SELECT "assessmentId", "contractId", "alunoId", "status", "completedAt", "completedByUserId", "requirementsSnapshot"
    FROM "AnthropometryAssessmentLifecycle"
    WHERE "assessmentId" = ${assessmentId} AND "contractId" = ${contractId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function listAssessmentLifecycles(
  contractId: string,
  assessmentIds: string[],
  client: DbClient = prisma
): Promise<AnthropometryLifecycleState[]> {
  if (assessmentIds.length === 0) return [];
  return client.$queryRaw<AnthropometryLifecycleState[]>(Prisma.sql`
    SELECT "assessmentId", "contractId", "alunoId", "status", "completedAt", "completedByUserId", "requirementsSnapshot"
    FROM "AnthropometryAssessmentLifecycle"
    WHERE "contractId" = ${contractId}
      AND "assessmentId" IN (${Prisma.join(assessmentIds)})
  `);
}

export async function listCorrectionAudits(
  contractId: string,
  assessmentIds: string[],
  client: DbClient = prisma
): Promise<AnthropometryCorrectionAudit[]> {
  if (assessmentIds.length === 0) return [];
  return client.$queryRaw<AnthropometryCorrectionAudit[]>(Prisma.sql`
    SELECT "id", "assessmentId", "contractId", "alunoId", "actorUserId", "actorProfessorId",
           "reason", "beforeSnapshot", "afterSnapshot", "createdAt"
    FROM "AnthropometryAssessmentCorrection"
    WHERE "contractId" = ${contractId}
      AND "assessmentId" IN (${Prisma.join(assessmentIds)})
    ORDER BY "createdAt" ASC
  `);
}

export async function markAssessmentCompleted(
  assessmentId: string,
  contractId: string,
  actorUserId: string,
  requirementsSnapshot: Prisma.InputJsonValue,
  client: DbClient = prisma
) {
  const changed = await client.$executeRaw(Prisma.sql`
    UPDATE "AnthropometryAssessmentLifecycle"
    SET "status" = 'COMPLETED',
        "completedAt" = CURRENT_TIMESTAMP,
        "completedByUserId" = ${actorUserId},
        "requirementsSnapshot" = ${JSON.stringify(requirementsSnapshot)}::jsonb,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "assessmentId" = ${assessmentId}
      AND "contractId" = ${contractId}
      AND "status" = 'DRAFT'
  `);
  return changed === 1;
}

export async function insertCorrectionAudit(
  data: Omit<AnthropometryCorrectionAudit, 'id' | 'createdAt'>,
  client: DbClient = prisma
) {
  const id = randomUUID();
  const rows = await client.$queryRaw<AnthropometryCorrectionAudit[]>(Prisma.sql`
    INSERT INTO "AnthropometryAssessmentCorrection"
      ("id", "assessmentId", "contractId", "alunoId", "actorUserId", "actorProfessorId", "reason", "beforeSnapshot", "afterSnapshot")
    VALUES (
      ${id}, ${data.assessmentId}, ${data.contractId}, ${data.alunoId}, ${data.actorUserId}, ${data.actorProfessorId},
      ${data.reason}, ${JSON.stringify(data.beforeSnapshot)}::jsonb, ${JSON.stringify(data.afterSnapshot)}::jsonb
    )
    RETURNING "id", "assessmentId", "contractId", "alunoId", "actorUserId", "actorProfessorId",
              "reason", "beforeSnapshot", "afterSnapshot", "createdAt"
  `);
  return rows[0];
}

export async function appendAnthropometryTimelineEvent(
  data: {
    alunoId: string;
    contractId: string;
    actorUserId?: string | null;
    actorProfessorId?: string | null;
    eventKey: string;
    action: 'completed' | 'corrected';
    assessmentId: string;
    assessmentCode: string;
    correctionId?: string;
  },
  client: DbClient = prisma
) {
  const eventType: StudentLifecycleEventType = 'STATUS_CHANGED';
  const prior = await client.studentLifecycleEvent.findFirst({
    where: {
      alunoId: data.alunoId,
      contractId: data.contractId,
      eventType,
      metadata: { path: ['eventKey'], equals: data.eventKey },
    },
    select: { id: true },
  });
  if (prior) return prior.id;

  const event = await client.studentLifecycleEvent.create({
    data: {
      alunoId: data.alunoId,
      contractId: data.contractId,
      eventType,
      actorUserId: data.actorUserId || null,
      actorProfessorId: data.actorProfessorId || null,
      metadata: {
        eventKey: data.eventKey,
        domain: 'anthropometry',
        action: data.action,
        assessmentId: data.assessmentId,
        assessmentCode: data.assessmentCode,
        ...(data.correctionId ? { correctionId: data.correctionId } : {}),
      },
    },
    select: { id: true },
  });
  return event.id;
}
