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

async function findAccessibleStudent(userId: string): Promise<AccessibleStudent> {
  const direct = await prisma.aluno.findFirst({
    where: {
      userId,
      status: { in: ACCESSIBLE_STATUSES },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, contractId: true },
  });
  if (direct) return { ...direct, accessRole: 'STUDENT' };

  const guardianRows = await prisma.$queryRaw<Array<{ alunoId: string; contractId: string }>>`
    SELECT authorization."alunoId", authorization."contractId"
    FROM "PreRegistrationGuardianAuthorization" AS authorization
    JOIN "Aluno" AS aluno ON aluno.id = authorization."alunoId"
    WHERE authorization."guardianUserId" = ${userId}
      AND authorization."status" = 'ACTIVE'
      AND aluno.status IN ('INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
    ORDER BY authorization."updatedAt" DESC
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
    input: SavePreRegistrationStepDTO
  ): Promise<{ version: number }> {
    const aluno = await findAccessibleStudent(userId);

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
          eventType: 'DUPLICATE_REVIEW_REQUESTED',
          actorUserId: userId,
          metadata: {
            source: 'public_pre_registration',
            field: 'cpf',
            draftPreserved: true,
          },
        },
      });

      return { version: input.expectedVersion + 1 };
    });
  },
};
