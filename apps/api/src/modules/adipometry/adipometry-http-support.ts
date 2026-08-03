import { Prisma, PrismaClient } from '@prisma/client';
import { AdipometryServiceError } from './adipometry.service.js';

const prisma = new PrismaClient();

const CONFLICT_CODES = [
  'ADIPOMETRY_CORRECTION_ALREADY_OPEN',
  'ADIPOMETRY_INVALID_CORRECTION_TARGET',
  'ADIPOMETRY_CORRECTION_NO_CHANGES',
  'ADIPOMETRY_CORRECTION_STATE_INVALID',
  'ADIPOMETRY_FINALIZED_IMMUTABLE',
  'ADIPOMETRY_PROTOCOL_APPROVAL_REVOKED',
  'ADIPOMETRY_PROTOCOL_APPROVAL_NOT_ACTIVE',
  'ADIPOMETRY_PROTOCOL_CHANGE_CONFIRMATION_REQUIRED',
  'ADIPOMETRY_CAPACITY_WARNING_CONFIRMATION_REQUIRED',
] as const;

const VALIDATION_CODES = [
  'ADIPOMETRY_CORRECTION_METADATA_REQUIRED',
  'ADIPOMETRY_INVALID_PROTOCOL_SEX_DECISION',
  'ADIPOMETRY_INVALID_CALCULATION_SNAPSHOT',
] as const;

function persistenceMessage(error: unknown): string {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return '';
  const meta = error.meta as Record<string, unknown> | undefined;
  return [meta?.message, meta?.database_error, error.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

/**
 * Converts PostgreSQL/Prisma implementation details into the stable public
 * contract used by the ADPT routes. The returned error never includes the raw
 * database message.
 */
export function mapAdipometryPersistenceError(error: unknown): AdipometryServiceError | null {
  const message = persistenceMessage(error);
  for (const code of CONFLICT_CODES) {
    if (message.includes(code)) {
      return new AdipometryServiceError(
        'A operação conflita com o estado atual da avaliação.',
        code,
        409
      );
    }
  }
  for (const code of VALIDATION_CODES) {
    if (message.includes(code)) {
      return new AdipometryServiceError(
        'Os dados informados não atendem às regras da adipometria.',
        code,
        400
      );
    }
  }
  if (message.includes('ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE')) {
    return new AdipometryServiceError(
      'Avaliação não encontrada.',
      'ADIPOMETRY_RESOURCE_NOT_FOUND',
      404
    );
  }
  return null;
}

/**
 * Persists the explicit capacity acknowledgement before calculating the
 * preview. This makes the acknowledgement part of the authoritative draft and
 * therefore visible to the later finalization transaction.
 */
export async function persistAdipometryCapacityConfirmation(
  contractId: string,
  assessmentId: string,
  actorUserId: string
) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      revisionStatus: string;
      tricepsMm: Prisma.Decimal | null;
      subscapularMm: Prisma.Decimal | null;
      suprailiacMm: Prisma.Decimal | null;
      abdominalMm: Prisma.Decimal | null;
      thighMm: Prisma.Decimal | null;
      skinfoldCapacityWarningConfirmedAt: Date | null;
    }>>(Prisma.sql`
      SELECT
        id,
        status,
        "revisionStatus",
        "tricepsMm",
        "subscapularMm",
        "suprailiacMm",
        "abdominalMm",
        "thighMm",
        "skinfoldCapacityWarningConfirmedAt"
      FROM "AdipometryAssessment"
      WHERE id = ${assessmentId}
        AND "contractId" = ${contractId}
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row) {
      throw new AdipometryServiceError(
        'Avaliação não encontrada.',
        'ADIPOMETRY_RESOURCE_NOT_FOUND',
        404
      );
    }
    if (row.status !== 'DRAFT' || row.revisionStatus !== 'DRAFT') {
      throw new AdipometryServiceError(
        'Somente um rascunho pode receber esta confirmação.',
        'ADIPOMETRY_INVALID_STATE',
        409
      );
    }
    if (row.skinfoldCapacityWarningConfirmedAt) return;

    const hasCapacityWarning = [
      row.tricepsMm,
      row.subscapularMm,
      row.suprailiacMm,
      row.abdominalMm,
      row.thighMm,
    ].some((value) => value !== null && value.toNumber() > 45 && value.toNumber() <= 80);
    if (!hasCapacityWarning) return;

    await tx.$queryRaw(Prisma.sql`
      SELECT set_config('app.adipometry_actor_user_id', ${actorUserId}, TRUE)
    `);
    await tx.adipometryAssessment.update({
      where: { id: assessmentId },
      data: {
        skinfoldCapacityWarningConfirmedByUserId: actorUserId,
        skinfoldCapacityWarningConfirmedAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
