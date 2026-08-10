import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AdipometryMeasurements,
  AdipometryProtocolDefinitionSnapshot,
  AdipometryProtocolSex,
  AdipometryProtocolSexSource,
} from '@corrida/types';
import { assertAdipometryProtocolDefinitionSnapshot } from '@corrida/types';
import {
  AdipometryServiceError,
  normalizeAdipometryDateOnly,
} from './adipometry.service.js';
import type {
  AdipometryProfileAuthority,
  PersistedAdipometryProtocolSexDecision,
} from './adipometry-clinical-integrity.js';

export const adipometryRuntimePrisma = new PrismaClient();
export type AdipometryDbClient = PrismaClient | Prisma.TransactionClient;
export type AdipometryAssessmentRow = Record<string, any>;

export type AdipometryApprovedProtocolRow = {
  protocolId: string;
  protocolCode: string;
  protocolVersion: number;
  protocolName: string;
  protocolStatus: 'DRAFT' | 'APPROVED' | 'DISABLED';
  protocolReference: string;
  definitionSnapshot: AdipometryProtocolDefinitionSnapshot;
  approvalId: string;
  responsibilityId: string;
  approvedAt: Date;
  approvedByProfessorId: string;
  approvedByName: string;
  approvedByCref: string;
  approvedSpecificationHash: string;
};

const SERIALIZABLE_TRANSACTION_RETRY_LIMIT = 3;

export function adipometryDateOnlyToDate(value: string): Date {
  return new Date(`${normalizeAdipometryDateOnly(value)}T00:00:00.000Z`);
}

function decimalToNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof (value as any)?.toNumber === 'function') return (value as any).toNumber();
  return Number(value);
}

export function adipometryMeasurementsFromRow(
  row: AdipometryAssessmentRow
): AdipometryMeasurements {
  const measurements: AdipometryMeasurements = {};
  for (const field of [
    'weightKg',
    'tricepsMm',
    'subscapularMm',
    'suprailiacMm',
    'abdominalMm',
    'thighMm',
  ] as const) {
    const value = decimalToNumber(row[field]);
    if (value !== undefined) measurements[field] = value;
  }
  return measurements;
}

function isSerializableTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
  const message = error instanceof Error ? error.message : '';
  return /could not serialize access|sqlstate\s*40001|current transaction is aborted/i.test(message);
}

export async function runAdipometrySerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_RETRY_LIMIT; attempt += 1) {
    try {
      return await adipometryRuntimePrisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializableTransactionConflict(error) || attempt === SERIALIZABLE_TRANSACTION_RETRY_LIMIT) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function setAdipometryActor(
  client: AdipometryDbClient,
  actorUserId: string
) {
  await client.$executeRaw(Prisma.sql`
    SELECT set_config('app.adipometry_actor_user_id', ${actorUserId}, TRUE)
  `);
}

async function lockProfileAuthority(
  client: AdipometryDbClient,
  contractId: string,
  alunoId: string
) {
  const alunoRows = await client.$queryRaw<Array<{ userId: string | null }>>(Prisma.sql`
    SELECT aluno."userId"
    FROM "Aluno" aluno
    WHERE aluno.id = ${alunoId}
      AND aluno."contractId" = ${contractId}
    FOR SHARE
  `);
  if (!alunoRows[0]) {
    throw new AdipometryServiceError(
      'Avaliação não encontrada.',
      'ADIPOMETRY_RESOURCE_NOT_FOUND',
      404
    );
  }

  await client.$queryRaw(Prisma.sql`
    SELECT student_profile.id
    FROM "StudentProfile" student_profile
    WHERE student_profile."alunoId" = ${alunoId}
      AND student_profile."contractId" = ${contractId}
    FOR SHARE
  `);
  if (alunoRows[0].userId) {
    await client.$queryRaw(Prisma.sql`
      SELECT profile.id
      FROM "Profile" profile
      WHERE profile."userId" = ${alunoRows[0].userId}
      FOR SHARE
    `);
  }
}

function canonicalProfileSex(value: unknown): AdipometryProfileAuthority['profileSex'] {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'male' || normalized === 'masculino') return 'male';
  if (normalized === 'female' || normalized === 'feminino') return 'female';
  if (normalized) return 'other';
  return null;
}

export async function getAdipometryProfile(
  client: AdipometryDbClient,
  contractId: string,
  alunoId: string,
  lock = false
): Promise<AdipometryProfileAuthority> {
  if (lock) await lockProfileAuthority(client, contractId, alunoId);
  const rows = await client.$queryRaw<Array<{
    birthDate: string | null;
    profileSex: string | null;
  }>>(Prisma.sql`
    SELECT
      COALESCE(
        LEFT(student_profile."identificationData" ->> 'birthDate', 10),
        TO_CHAR(aluno."birthDate", 'YYYY-MM-DD'),
        TO_CHAR(profile."birthDate", 'YYYY-MM-DD')
      ) AS "birthDate",
      COALESCE(
        student_profile."identificationData" ->> 'gender',
        profile.gender::TEXT
      ) AS "profileSex"
    FROM "Aluno" aluno
    LEFT JOIN "StudentProfile" student_profile
      ON student_profile."alunoId" = aluno.id
     AND student_profile."contractId" = aluno."contractId"
    LEFT JOIN "Profile" profile ON profile."userId" = aluno."userId"
    WHERE aluno.id = ${alunoId}
      AND aluno."contractId" = ${contractId}
    LIMIT 1
  `);
  if (!rows[0]) {
    throw new AdipometryServiceError(
      'Avaliação não encontrada.',
      'ADIPOMETRY_RESOURCE_NOT_FOUND',
      404
    );
  }
  return {
    birthDate: rows[0].birthDate
      ? normalizeAdipometryDateOnly(rows[0].birthDate)
      : null,
    profileSex: canonicalProfileSex(rows[0].profileSex),
  };
}

export async function getAdipometryAssessmentRow(
  client: AdipometryDbClient,
  contractId: string,
  assessmentId: string,
  lock = false
): Promise<AdipometryAssessmentRow> {
  const rows = await client.$queryRaw<AdipometryAssessmentRow[]>(Prisma.sql`
    SELECT assessment.*
    FROM "AdipometryAssessment" assessment
    WHERE assessment.id = ${assessmentId}
      AND assessment."contractId" = ${contractId}
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  if (!rows[0]) {
    throw new AdipometryServiceError(
      'Avaliação não encontrada.',
      'ADIPOMETRY_RESOURCE_NOT_FOUND',
      404
    );
  }
  return rows[0];
}

export async function getAdipometryApprovedProtocol(
  client: AdipometryDbClient,
  contractId: string,
  protocolCode: string,
  protocolVersion: number,
  lockApproval = false
): Promise<AdipometryApprovedProtocolRow> {
  const rows = await client.$queryRaw<AdipometryApprovedProtocolRow[]>(Prisma.sql`
    SELECT
      protocol.id AS "protocolId",
      protocol.code AS "protocolCode",
      protocol.version AS "protocolVersion",
      protocol.name AS "protocolName",
      protocol.status AS "protocolStatus",
      approval."protocolReferenceSnapshot" AS "protocolReference",
      approval."protocolDefinitionSnapshot" AS "definitionSnapshot",
      approval.id AS "approvalId",
      approval."responsibilityId",
      approval."approvedAt",
      approval."approvedByProfessorId",
      approval."approvedByNameSnapshot" AS "approvedByName",
      approval."approvedByCrefSnapshot" AS "approvedByCref",
      approval."approvedSpecificationHash"
    FROM "AdipometryProtocol" protocol
    JOIN "AdipometryProtocolApproval" approval
      ON approval."protocolId" = protocol.id
     AND approval."protocolCode" = protocol.code
     AND approval."protocolVersion" = protocol.version
    WHERE approval."contractId" = ${contractId}
      AND approval."revokedAt" IS NULL
      AND protocol.code = ${protocolCode}
      AND protocol.version = ${protocolVersion}
      AND protocol.status <> 'DISABLED'
    LIMIT 1
    ${lockApproval ? Prisma.sql`FOR SHARE OF approval` : Prisma.empty}
  `);
  if (!rows[0]) {
    throw new AdipometryServiceError(
      'O protocolo não possui aprovação clínica ativa para este contrato.',
      'PROTOCOL_NOT_APPROVED_FOR_CONTRACT',
      409
    );
  }
  assertAdipometryProtocolDefinitionSnapshot(rows[0].definitionSnapshot);
  return rows[0];
}

export async function getAdipometryAnthropometrySupport(
  client: AdipometryDbClient,
  contractId: string,
  alunoId: string,
  assessmentDate: string,
  linkedId: string | null
) {
  const [latestEligible, linked] = await Promise.all([
    client.anthropometryAssessment.findFirst({
      where: {
        contractId,
        alunoId,
        assessmentDate: { lte: adipometryDateOnlyToDate(assessmentDate) },
      },
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, code: true, assessmentDate: true },
    }),
    linkedId
      ? client.anthropometryAssessment.findFirst({
          where: { id: linkedId, contractId, alunoId },
          select: { id: true, code: true, assessmentDate: true },
        })
      : Promise.resolve(null),
  ]);
  const serialize = (item: typeof latestEligible) => item
    ? {
        anthropometryAssessmentId: item.id,
        assessmentCode: item.code,
        assessmentDate: normalizeAdipometryDateOnly(item.assessmentDate),
      }
    : null;
  return { latestEligible: serialize(latestEligible), linked: serialize(linked) };
}

export function getPersistedAdipometryDecision(
  row: AdipometryAssessmentRow
): PersistedAdipometryProtocolSexDecision {
  return {
    protocolSex: row.protocolSex as AdipometryProtocolSex | null,
    profileSexSnapshot: row.profileSexSnapshot === 'male' || row.profileSexSnapshot === 'female'
      ? row.profileSexSnapshot
      : 'other',
    source: row.protocolSexSource as AdipometryProtocolSexSource | null,
    confirmedByUserId: row.protocolSexConfirmedByUserId ?? null,
    confirmedAt: row.protocolSexConfirmedAt
      ? new Date(row.protocolSexConfirmedAt).toISOString()
      : null,
    overrideReason: row.protocolSexOverrideReason ?? null,
  };
}
