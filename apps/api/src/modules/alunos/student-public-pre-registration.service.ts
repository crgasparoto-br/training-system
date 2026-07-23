import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  PreRegistrationClaimRole,
  StudentLifecycleStatus,
} from '@corrida/types';
import {
  loadStudentIdentity,
  normalizeStudentPhone,
} from './student-identity.service.js';
import {
  assertValidStudentLifecycleTransition,
  findMissingPreRegistrationFields,
  StudentLifecycleError,
} from './student-lifecycle.service.js';

const prisma = new PrismaClient();

type LockedStudentRow = {
  id: string;
  status: StudentLifecycleStatus;
};

type LockedOnboardingRow = {
  version: number;
};

function isMinorBirthDate(value?: string | Date | null, now = new Date()): boolean {
  if (!value) return false;
  const birthDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(birthDate.getTime())) return false;
  let age = now.getFullYear() - birthDate.getFullYear();
  const month = now.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age < 18;
}

async function assertActiveGuardianAuthorization(
  tx: Prisma.TransactionClient,
  input: {
    alunoId: string;
    contractId: string;
    actorUserId: string;
    accessRole: PreRegistrationClaimRole;
  }
): Promise<void> {
  const identity = await loadStudentIdentity(input.alunoId, input.contractId, tx);
  const isMinor = isMinorBirthDate(identity.birthDate);

  if (input.accessRole === 'GUARDIAN' && !isMinor) {
    throw new StudentLifecycleError(
      'O acesso como responsável legal está disponível somente para cadastro de menor de idade.',
      'PRECONDITION_FAILED'
    );
  }

  if (!isMinor) return;

  const rows = input.accessRole === 'GUARDIAN'
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${input.alunoId}
          AND "contractId" = ${input.contractId}
          AND "guardianUserId" = ${input.actorUserId}
          AND "purpose" = 'PRE_REGISTRATION'
          AND "status" = 'ACTIVE'
        LIMIT 1
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${input.alunoId}
          AND "contractId" = ${input.contractId}
          AND "purpose" = 'PRE_REGISTRATION'
          AND "status" = 'ACTIVE'
        LIMIT 1
      `;

  if (!rows[0]) {
    throw new StudentLifecycleError(
      'A autorização do responsável legal deve estar válida antes da conclusão.',
      'PRECONDITION_FAILED',
      { fields: ['guardianAuthorization'] }
    );
  }
}

export async function startGuardianPreRegistrationInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  actorUserId: string
): Promise<void> {
  const authorization = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PreRegistrationGuardianAuthorization"
    WHERE "alunoId" = ${alunoId}
      AND "contractId" = ${contractId}
      AND "guardianUserId" = ${actorUserId}
      AND "purpose" = 'PRE_REGISTRATION'
      AND "status" = 'ACTIVE'
    LIMIT 1
  `;
  if (!authorization[0]) {
    throw new StudentLifecycleError(
      'Confirme o vínculo com o menor antes de preencher os dados pessoais.',
      'PRECONDITION_FAILED'
    );
  }

  const rows = await tx.$queryRaw<LockedStudentRow[]>`
    SELECT "id", "status"
    FROM "Aluno"
    WHERE "id" = ${alunoId} AND "contractId" = ${contractId}
    FOR UPDATE
  `;
  const aluno = rows[0];
  if (!aluno) {
    throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  }
  if (aluno.status === 'PRE_REGISTRATION_IN_PROGRESS') return;
  if (aluno.status !== 'INVITED') {
    throw new StudentLifecycleError(
      'O cadastro não está disponível para iniciar o pré-cadastro.',
      'INVALID_TRANSITION'
    );
  }

  assertValidStudentLifecycleTransition(aluno.status, 'PRE_REGISTRATION_IN_PROGRESS');
  const changed = await tx.aluno.updateMany({
    where: { id: alunoId, contractId, status: 'INVITED' },
    data: { status: 'PRE_REGISTRATION_IN_PROGRESS' },
  });
  if (changed.count !== 1) {
    throw new StudentLifecycleError(
      'O cadastro foi alterado em outro acesso.',
      'CONCURRENT_MODIFICATION'
    );
  }

  const onboarding = await tx.studentOnboardingProcess.updateMany({
    where: { alunoId, contractId },
    data: { startedAt: new Date() },
  });
  if (onboarding.count !== 1) {
    throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
  }

  await tx.studentLifecycleEvent.create({
    data: {
      alunoId,
      contractId,
      eventType: 'STATUS_CHANGED',
      actorUserId,
      metadata: {
        from: 'INVITED',
        to: 'PRE_REGISTRATION_IN_PROGRESS',
        source: 'guardian_first_authenticated_save',
      },
    },
  });
}

async function reconcileCompletedInvites(
  tx: Prisma.TransactionClient,
  input: {
    alunoId: string;
    contractId: string;
    actorUserId: string;
    completedAt: Date;
  }
): Promise<void> {
  const activeInvites = await tx.preRegistrationInvite.findMany({
    where: {
      alunoId: input.alunoId,
      contractId: input.contractId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  for (const invite of activeInvites) {
    await tx.preRegistrationInvite.update({
      where: { id: invite.id },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    const existingEvent = await tx.preRegistrationInviteEvent.findFirst({
      where: { inviteId: invite.id, eventType: 'COMPLETED' },
      select: { id: true },
    });
    if (!existingEvent) {
      await tx.preRegistrationInviteEvent.create({
        data: {
          id: crypto.randomUUID(),
          inviteId: invite.id,
          eventType: 'COMPLETED',
          actorUserId: input.actorUserId,
          metadata: { source: 'public_pre_registration' },
        },
      });
    }
  }
}

export async function completePublicStudentPreRegistration(input: {
  alunoId: string;
  contractId: string;
  actorUserId: string;
  accessRole: PreRegistrationClaimRole;
  expectedVersion: number;
  privacyNoticeVersion: string;
  privacyAcceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const studentRows = await tx.$queryRaw<LockedStudentRow[]>`
      SELECT "id", "status"
      FROM "Aluno"
      WHERE "id" = ${input.alunoId} AND "contractId" = ${input.contractId}
      FOR UPDATE
    `;
    const aluno = studentRows[0];
    if (!aluno) {
      throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    }

    const onboardingRows = await tx.$queryRaw<LockedOnboardingRow[]>`
      SELECT "version"
      FROM "StudentOnboardingProcess"
      WHERE "alunoId" = ${input.alunoId} AND "contractId" = ${input.contractId}
      FOR UPDATE
    `;
    const onboarding = onboardingRows[0];
    if (!onboarding) {
      throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
    }

    const alreadyCompleted = aluno.status === 'PRE_REGISTRATION_COMPLETED';
    if (!alreadyCompleted) {
      if (onboarding.version !== input.expectedVersion) {
        throw new StudentLifecycleError(
          'Os dados foram alterados em outro local. Recarregue antes de concluir.',
          'CONCURRENT_MODIFICATION',
          { currentVersion: onboarding.version }
        );
      }

      assertValidStudentLifecycleTransition(aluno.status, 'PRE_REGISTRATION_COMPLETED');
      const identity = await loadStudentIdentity(input.alunoId, input.contractId, tx);
      const missing = findMissingPreRegistrationFields({
        name: identity.name || undefined,
        birthDate: identity.birthDate || undefined,
        phone: identity.phone || undefined,
        privacyNoticeVersion: input.privacyNoticeVersion,
        privacyAcceptedAt: input.privacyAcceptedAt,
      });
      if (!identity.cpf) missing.push('cpf');
      if (isMinorBirthDate(identity.birthDate)) {
        if (!identity.guardianName) missing.push('guardianName');
        if (!identity.guardianCpf) missing.push('guardianCpf');
      }
      if (!normalizeStudentPhone(identity.phone)) missing.push('phone');
      if (missing.length > 0) {
        throw new StudentLifecycleError(
          'Revise os campos obrigatórios antes de concluir.',
          'MISSING_REQUIRED_FIELDS',
          { fields: Array.from(new Set(missing)) }
        );
      }

      await assertActiveGuardianAuthorization(tx, input);

      const changed = await tx.aluno.updateMany({
        where: {
          id: input.alunoId,
          contractId: input.contractId,
          status: 'PRE_REGISTRATION_IN_PROGRESS',
        },
        data: { status: 'PRE_REGISTRATION_COMPLETED' },
      });
      if (changed.count !== 1) {
        throw new StudentLifecycleError(
          'O cadastro foi alterado em outro acesso.',
          'CONCURRENT_MODIFICATION'
        );
      }

      const onboardingUpdated = await tx.$executeRaw`
        UPDATE "StudentOnboardingProcess"
        SET "version" = "version" + 1,
            "currentStep" = 'PRIVACY',
            "privacyNoticeVersion" = ${input.privacyNoticeVersion},
            "privacyAcceptedAt" = ${input.privacyAcceptedAt},
            "privacyAcceptedIp" = ${input.ipAddress || null},
            "privacyAcceptedUserAgent" = ${input.userAgent?.slice(0, 512) || null},
            "completedAt" = ${input.privacyAcceptedAt},
            "lastSavedAt" = ${input.privacyAcceptedAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "alunoId" = ${input.alunoId}
          AND "contractId" = ${input.contractId}
          AND "version" = ${input.expectedVersion}
      `;
      if (onboardingUpdated !== 1) {
        throw new StudentLifecycleError(
          'Os dados foram alterados em outro local. Recarregue antes de concluir.',
          'CONCURRENT_MODIFICATION'
        );
      }

      await tx.studentLifecycleEvent.createMany({
        data: [
          {
            alunoId: input.alunoId,
            contractId: input.contractId,
            eventType: 'STATUS_CHANGED',
            actorUserId: input.actorUserId,
            metadata: {
              from: aluno.status,
              to: 'PRE_REGISTRATION_COMPLETED',
              source: 'public_pre_registration',
              accessRole: input.accessRole,
            },
          },
          {
            alunoId: input.alunoId,
            contractId: input.contractId,
            eventType: 'PRE_REGISTRATION_COMPLETED',
            actorUserId: input.actorUserId,
            metadata: {
              source: 'public_pre_registration',
              accessRole: input.accessRole,
            },
          },
          {
            alunoId: input.alunoId,
            contractId: input.contractId,
            eventType: 'PRIVACY_CONSENT_RECORDED',
            actorUserId: input.actorUserId,
            metadata: {
              source: 'public_pre_registration',
              noticeVersion: input.privacyNoticeVersion,
              accessRole: input.accessRole,
            },
          },
        ],
      });
    } else {
      await tx.$executeRaw`
        UPDATE "StudentOnboardingProcess"
        SET "currentStep" = 'PRIVACY',
            "privacyAcceptedIp" = COALESCE("privacyAcceptedIp", ${input.ipAddress || null}),
            "privacyAcceptedUserAgent" = COALESCE(
              "privacyAcceptedUserAgent",
              ${input.userAgent?.slice(0, 512) || null}
            ),
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "alunoId" = ${input.alunoId} AND "contractId" = ${input.contractId}
      `;
    }

    await reconcileCompletedInvites(tx, {
      alunoId: input.alunoId,
      contractId: input.contractId,
      actorUserId: input.actorUserId,
      completedAt: input.privacyAcceptedAt,
    });
  });
}