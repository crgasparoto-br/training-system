import { Prisma, PrismaClient } from '@prisma/client';
import { AdipometryServiceError, adipometryService } from './adipometry.service.js';

const prisma = new PrismaClient();

export interface ReassignAdipometryResponsibleProfessorInput {
  contractId: string;
  assessmentId: string;
  actorUserId: string;
  responsibleProfessorId: string;
  expectedUpdatedAt: string;
}

/**
 * Reassign the clinical responsible of an editable ADPT draft.
 *
 * Eligibility is checked by the caller for a safe public error and again by
 * the PostgreSQL trigger in the same transaction as the update. The row lock
 * and expectedUpdatedAt prevent a recovery action from overwriting a newer
 * draft state.
 */
export async function reassignAdipometryResponsibleProfessor({
  contractId,
  assessmentId,
  actorUserId,
  responsibleProfessorId,
  expectedUpdatedAt,
}: ReassignAdipometryResponsibleProfessorInput) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT set_config('app.adipometry_actor_user_id', ${actorUserId}, true)
    `);

    const rows = await tx.$queryRaw<Array<{
      status: 'DRAFT' | 'COMPLETED';
      revisionStatus: 'DRAFT' | 'FINALIZED' | 'SUPERSEDED' | 'CANCELLED' | 'VOIDED';
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT assessment.status, assessment."revisionStatus", assessment."updatedAt"
      FROM "AdipometryAssessment" assessment
      WHERE assessment.id = ${assessmentId}
        AND assessment."contractId" = ${contractId}
      FOR UPDATE
    `);

    const current = rows[0];
    if (!current) {
      throw new AdipometryServiceError(
        'Avaliação não encontrada.',
        'ADIPOMETRY_RESOURCE_NOT_FOUND',
        404
      );
    }

    if (current.status !== 'DRAFT' || current.revisionStatus !== 'DRAFT') {
      throw new AdipometryServiceError(
        'O responsável somente pode ser alterado enquanto a avaliação estiver em rascunho.',
        'ADIPOMETRY_FINALIZED_IMMUTABLE',
        409
      );
    }

    if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new AdipometryServiceError(
        'O rascunho foi atualizado por outra sessão. Recarregue antes de trocar o responsável.',
        'ADIPOMETRY_STALE_DRAFT',
        409
      );
    }

    await tx.adipometryAssessment.update({
      where: { id: assessmentId },
      data: {
        professorId: responsibleProfessorId,
        updatedAt: new Date(),
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return adipometryService.getAssessment(contractId, assessmentId);
}
