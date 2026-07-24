import { Prisma, PrismaClient } from '@prisma/client';
import type {
  PreRegistrationGuardianAuthorizationAdminDTO,
} from '@corrida/types';
import {
  PreRegistrationAdminError,
  preRegistrationAdminService,
  type PreRegistrationAdminActor,
} from './pre-registration-admin.service.js';

const prisma = new PrismaClient();

type GuardianAuthorizationRecord = Prisma.PreRegistrationGuardianAuthorizationGetPayload<{
  include: {
    guardianUser: { include: { profile: true } };
    validatedByUser: { include: { profile: true } };
    revokedByUser: { include: { profile: true } };
  };
}>;

const authorizationInclude = Prisma.validator<Prisma.PreRegistrationGuardianAuthorizationInclude>()({
  guardianUser: { include: { profile: true } },
  validatedByUser: { include: { profile: true } },
  revokedByUser: { include: { profile: true } },
});

function userName(user: { email: string; profile?: { name: string } | null }) {
  return user.profile?.name || user.email;
}

function serialize(
  authorization: GuardianAuthorizationRecord
): PreRegistrationGuardianAuthorizationAdminDTO {
  return {
    id: authorization.id,
    alunoId: authorization.alunoId,
    contractId: authorization.contractId,
    status: authorization.status as PreRegistrationGuardianAuthorizationAdminDTO['status'],
    relationship: authorization.relationship || undefined,
    requestedAt: authorization.updatedAt.toISOString(),
    validatedAt: authorization.validatedAt?.toISOString(),
    revokedAt: authorization.revokedAt?.toISOString(),
    guardian: {
      userId: authorization.guardianUser.id,
      name: userName(authorization.guardianUser),
      email: authorization.guardianUser.email,
      phone: authorization.guardianUser.profile?.phone || undefined,
    },
    validatedBy: authorization.validatedByUser
      ? {
          userId: authorization.validatedByUser.id,
          name: userName(authorization.validatedByUser),
        }
      : undefined,
    revokedBy: authorization.revokedByUser
      ? {
          userId: authorization.revokedByUser.id,
          name: userName(authorization.revokedByUser),
        }
      : undefined,
  };
}

async function assertScopedReviewAccess(actor: PreRegistrationAdminActor, alunoId: string) {
  if (!actor.userId) {
    throw new PreRegistrationAdminError(
      'Usuário autenticado não disponível para validar o vínculo.',
      'FORBIDDEN'
    );
  }
  const detail = await preRegistrationAdminService.getDetail(actor, alunoId);
  if (!detail.allowedActions.canValidateGuardianAuthorization) {
    throw new PreRegistrationAdminError(
      'Sem permissão para validar responsável legal.',
      'FORBIDDEN'
    );
  }
}

async function findLatest(alunoId: string, contractId: string) {
  return prisma.preRegistrationGuardianAuthorization.findFirst({
    where: { alunoId, contractId, purpose: 'PRE_REGISTRATION' },
    include: authorizationInclude,
    orderBy: { updatedAt: 'desc' },
  });
}

export const preRegistrationGuardianAuthorizationAdminService = {
  async get(
    actor: PreRegistrationAdminActor,
    alunoId: string
  ): Promise<PreRegistrationGuardianAuthorizationAdminDTO | null> {
    await assertScopedReviewAccess(actor, alunoId);
    const authorization = await findLatest(alunoId, actor.contractId);
    return authorization ? serialize(authorization) : null;
  },

  async approve(
    actor: PreRegistrationAdminActor,
    alunoId: string
  ): Promise<PreRegistrationGuardianAuthorizationAdminDTO> {
    await assertScopedReviewAccess(actor, alunoId);
    const validatorUserId = actor.userId!;

    try {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; guardianUserId: string; relationship: string | null }>
        >`
          SELECT auth."id", auth."guardianUserId", auth."relationship"
          FROM "PreRegistrationGuardianAuthorization" AS auth
          JOIN "StudentOnboardingProcess" AS onboarding
            ON onboarding."alunoId" = auth."alunoId"
           AND onboarding."contractId" = auth."contractId"
          WHERE auth."alunoId" = ${alunoId}
            AND auth."contractId" = ${actor.contractId}
            AND auth."purpose" = 'PRE_REGISTRATION'
            AND auth."status" = 'PENDING'
            AND onboarding."claimedByUserId" = auth."guardianUserId"
            AND onboarding."claimRole" = 'GUARDIAN'
          ORDER BY auth."updatedAt" DESC
          LIMIT 1
          FOR UPDATE OF auth
        `;
        const authorization = rows[0];
        if (!authorization?.relationship?.trim()) {
          throw new PreRegistrationAdminError(
            'O responsável ainda não informou e declarou o vínculo.',
            'PRECONDITION_FAILED'
          );
        }
        if (authorization.guardianUserId === validatorUserId) {
          throw new PreRegistrationAdminError(
            'O responsável não pode validar o próprio vínculo.',
            'FORBIDDEN'
          );
        }

        const changed = await tx.preRegistrationGuardianAuthorization.updateMany({
          where: {
            id: authorization.id,
            alunoId,
            contractId: actor.contractId,
            status: 'PENDING',
          },
          data: {
            status: 'ACTIVE',
            validatedAt: new Date(),
            validatedByUserId: validatorUserId,
            revokedAt: null,
            revokedByUserId: null,
          },
        });
        if (changed.count !== 1) {
          throw new PreRegistrationAdminError(
            'O vínculo foi alterado por outra operação. Atualize a ficha.',
            'CONCURRENT_MODIFICATION'
          );
        }

        await tx.studentLifecycleEvent.create({
          data: {
            alunoId,
            contractId: actor.contractId,
            eventType: 'ADMIN_REVIEWED',
            actorUserId: validatorUserId,
            actorProfessorId: actor.professorId,
            metadata: {
              source: 'pre_registration_admin',
              action: 'guardian_authorization_approved',
              guardianUserId: authorization.guardianUserId,
              relationship: authorization.relationship,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof PreRegistrationAdminError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PreRegistrationAdminError(
          'Outro vínculo de responsável já está ativo para este aluno.',
          'CONCURRENT_MODIFICATION'
        );
      }
      throw error;
    }

    const updated = await findLatest(alunoId, actor.contractId);
    if (!updated) {
      throw new PreRegistrationAdminError('Vínculo não encontrado.', 'NOT_FOUND');
    }
    return serialize(updated);
  },

  async revoke(
    actor: PreRegistrationAdminActor,
    alunoId: string,
    reason: string
  ): Promise<PreRegistrationGuardianAuthorizationAdminDTO> {
    await assertScopedReviewAccess(actor, alunoId);
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new PreRegistrationAdminError('Informe o motivo da revogação.', 'INVALID_INPUT');
    }

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; guardianUserId: string }>>`
        SELECT "id", "guardianUserId"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${alunoId}
          AND "contractId" = ${actor.contractId}
          AND "purpose" = 'PRE_REGISTRATION'
          AND "status" IN ('PENDING', 'ACTIVE')
        ORDER BY "updatedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      const authorization = rows[0];
      if (!authorization) {
        throw new PreRegistrationAdminError(
          'Não existe vínculo pendente ou ativo para revogar.',
          'PRECONDITION_FAILED'
        );
      }

      const changed = await tx.preRegistrationGuardianAuthorization.updateMany({
        where: {
          id: authorization.id,
          alunoId,
          contractId: actor.contractId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByUserId: actor.userId!,
        },
      });
      if (changed.count !== 1) {
        throw new PreRegistrationAdminError(
          'O vínculo foi alterado por outra operação. Atualize a ficha.',
          'CONCURRENT_MODIFICATION'
        );
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId: actor.contractId,
          eventType: 'ACCOUNT_UNLINKED',
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: {
            source: 'pre_registration_admin',
            action: 'guardian_authorization_revoked',
            guardianUserId: authorization.guardianUserId,
            reason: normalizedReason,
          },
        },
      });
    });

    const updated = await findLatest(alunoId, actor.contractId);
    if (!updated) {
      throw new PreRegistrationAdminError('Vínculo não encontrado.', 'NOT_FOUND');
    }
    return serialize(updated);
  },
};
