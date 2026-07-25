import { Prisma, PrismaClient } from '@prisma/client';
import type { SavePreRegistrationStepDTO } from '@corrida/types';
import {
  loadStudentIdentity,
  upsertStudentIdentity,
} from '../alunos/student-identity.service.js';
import {
  lockAndAuthorizePreRegistrationProcess,
  startAuthorizedPreRegistrationInTransaction,
} from './pre-registration-public-atomic.service.js';

const prisma = new PrismaClient();

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const preRegistrationDuplicateReviewService = {
  async preserveCpfConflict(
    userId: string,
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<{ version: number }> {
    if (input.step !== 'IDENTIFICATION') {
      throw new Error('Conflito de CPF recebido fora da etapa de identificação.');
    }

    return prisma.$transaction(async (tx) => {
      let access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.onboarding.version !== input.expectedVersion) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      access = await startAuthorizedPreRegistrationInTransaction(tx, access, userId);
      const before = await loadStudentIdentity(access.alunoId, access.contractId, tx);
      const { cpf: proposedCpf, ...safeData } = input.data;

      await upsertStudentIdentity(
        access.alunoId,
        access.contractId,
        safeData,
        {
          client: tx,
          actor: { userId },
          sourceType: 'student',
          sourceReference: 'public_pre_registration_duplicate_review',
          syncLegacyProfile: access.accessRole === 'STUDENT',
        }
      );

      // Data de nascimento também pode mudar nesta etapa. Revalide a autoridade
      // depois da escrita canônica e antes de preservar qualquer revisão ou evento.
      access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.onboarding.version !== input.expectedVersion) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      const after = {
        ...before,
        ...safeData,
        cpf: proposedCpf,
      };
      const pendingReview = await tx.studentProfileReview.findFirst({
        where: {
          alunoId: access.alunoId,
          status: 'pending',
          requiresApproval: true,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (pendingReview) {
        await tx.studentProfileReview.update({
          where: { id: pendingReview.id },
          data: {
            requestedByUserId: userId,
            requestedAt: new Date(),
            sectionsRequested: asJson(['identification']),
            snapshotBefore: asJson(before),
            snapshotAfter: asJson(after),
            changedFields: asJson(['cpf']),
            requiresApproval: true,
          },
        });
      } else {
        await tx.studentProfileReview.create({
          data: {
            alunoId: access.alunoId,
            requestedByUserId: userId,
            sectionsRequested: asJson(['identification']),
            snapshotBefore: asJson(before),
            snapshotAfter: asJson(after),
            changedFields: asJson(['cpf']),
            requiresApproval: true,
          },
        });
      }

      const updated = await tx.$executeRaw`
        UPDATE "StudentOnboardingProcess"
        SET "version" = "version" + 1,
            "currentStep" = ${input.step},
            "lastSavedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "alunoId" = ${access.alunoId}
          AND "contractId" = ${access.contractId}
          AND "claimedByUserId" = ${userId}
          AND "claimRole" = ${access.accessRole}
          AND "version" = ${input.expectedVersion}
      `;
      if (updated !== 1) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: access.alunoId,
          contractId: access.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: userId,
          metadata: {
            source: 'public_pre_registration',
            action: 'duplicate_review_requested',
            field: 'cpf',
            draftPreserved: true,
          },
        },
      });

      return { version: input.expectedVersion + 1 };
    });
  },
};
