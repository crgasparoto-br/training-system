import { Prisma, PrismaClient } from '@prisma/client';
import type {
  PreRegistrationClaimRole,
  SavePreRegistrationStepDTO,
  StudentLifecycleStatus,
} from '@corrida/types';
import {
  loadStudentIdentity,
  upsertStudentIdentity,
} from '../alunos/student-identity.service.js';

const prisma = new PrismaClient();
const ACCESSIBLE_STATUSES: StudentLifecycleStatus[] = [
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
  'PRE_REGISTRATION_COMPLETED',
];

type AccessibleStudent = {
  id: string;
  contractId: string;
  accessRole: PreRegistrationClaimRole;
};

type LockedOnboarding = {
  version: number;
};

async function findAccessibleStudent(
  userId: string,
  alunoId: string
): Promise<AccessibleStudent> {
  const direct = await prisma.aluno.findFirst({
    where: {
      id: alunoId,
      userId,
      status: { in: ACCESSIBLE_STATUSES },
      onboarding: { claimedByUserId: userId },
    },
    select: { id: true, contractId: true },
  });
  if (direct) return { ...direct, accessRole: 'STUDENT' };

  const guardianRows = await prisma.$queryRaw<Array<{ alunoId: string; contractId: string }>>`
    SELECT auth."alunoId", auth."contractId"
    FROM "PreRegistrationGuardianAuthorization" AS auth
    JOIN "Aluno" AS student ON student."id" = auth."alunoId"
    JOIN "StudentOnboardingProcess" AS onboarding ON onboarding."alunoId" = student."id"
    WHERE auth."guardianUserId" = ${userId}
      AND auth."alunoId" = ${alunoId}
      AND auth."purpose" = 'PRE_REGISTRATION'
      AND auth."status" = 'ACTIVE'
      AND onboarding."claimedByUserId" = ${userId}
      AND student."status" IN ('INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
    LIMIT 1
  `;
  const guardian = guardianRows[0];
  if (!guardian) throw new Error('Cadastro não encontrado para preservar o rascunho.');
  return {
    id: guardian.alunoId,
    contractId: guardian.contractId,
    accessRole: 'GUARDIAN',
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const preRegistrationDuplicateReviewService = {
  async preserveCpfConflict(
    userId: string,
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<{ version: number }> {
    const aluno = await findAccessibleStudent(userId, alunoId);

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedOnboarding[]>`
        SELECT "version"
        FROM "StudentOnboardingProcess"
        WHERE "alunoId" = ${aluno.id} AND "contractId" = ${aluno.contractId}
        FOR UPDATE
      `;
      const onboarding = rows[0];
      if (!onboarding || onboarding.version !== input.expectedVersion) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      const before = await loadStudentIdentity(aluno.id, aluno.contractId, tx);
      const { cpf: proposedCpf, ...safeData } = input.data;

      await upsertStudentIdentity(
        aluno.id,
        aluno.contractId,
        safeData,
        {
          client: tx,
          actor: { userId },
          sourceType: 'student',
          sourceReference: 'public_pre_registration_duplicate_review',
          syncLegacyProfile: aluno.accessRole === 'STUDENT',
        }
      );

      const after = {
        ...before,
        ...safeData,
        cpf: proposedCpf,
      };
      const pendingReview = await tx.studentProfileReview.findFirst({
        where: {
          alunoId: aluno.id,
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
            alunoId: aluno.id,
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
        WHERE "alunoId" = ${aluno.id}
          AND "contractId" = ${aluno.contractId}
          AND "version" = ${input.expectedVersion}
      `;
      if (updated !== 1) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: aluno.id,
          contractId: aluno.contractId,
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