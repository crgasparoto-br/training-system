import { Prisma, type Aluno } from '@prisma/client';
import type { StudentLifecycleActorDTO, StudentLifecycleStatus } from '@corrida/types';
import {
  assertValidStudentLifecycleTransition,
  findMissingPreRegistrationFields,
  StudentLifecycleError,
} from './student-lifecycle.service.js';
import { loadStudentIdentity } from './student-identity.service.js';
import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from '../pre-registration-public/pre-registration-policy.js';

type EnrollmentTransitionInput = {
  actor: StudentLifecycleActorDTO;
  metadata: Record<string, unknown>;
};

const cleanAddressText = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export function hasCurrentPreRegistrationConsent(
  privacyNoticeVersion: string | null | undefined,
  privacyAcceptedAt: Date | null | undefined
): boolean {
  return Boolean(
    privacyAcceptedAt &&
      privacyNoticeVersion === PRE_REGISTRATION_PRIVACY_NOTICE_VERSION
  );
}

async function assertProfessorInContract(
  tx: Prisma.TransactionClient,
  professorId: string | undefined,
  contractId: string
): Promise<void> {
  if (!professorId) return;
  const professor = await tx.professor.findFirst({
    where: { id: professorId, contractId },
    select: { id: true },
  });
  if (!professor) {
    throw new StudentLifecycleError('Responsável não encontrado.', 'NOT_FOUND');
  }
}

/**
 * Mantém `StudentProfile.identificationData` como fonte canônica e atualiza
 * somente a projeção legada de endereço ainda consumida por partes do cadastro.
 *
 * A projeção é permitida apenas quando a conta está vinculada a um único
 * registro de aluno. Isso evita sobrescrever um `Profile` global com dados
 * tenant-scoped quando a mesma conta participa de mais de um cadastro.
 */
export async function syncStudentAddressLegacyProfileProjectionInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<boolean> {
  const aluno = await tx.aluno.findFirst({
    where: { id: alunoId, contractId },
    include: {
      user: {
        include: { profile: true },
      },
    },
  });

  if (!aluno?.userId || !aluno.user?.profile) return false;

  const linkedStudentCount = await tx.aluno.count({
    where: { userId: aluno.userId },
  });
  if (linkedStudentCount !== 1) return false;

  const identity = await loadStudentIdentity(alunoId, contractId, tx);

  await tx.profile.update({
    where: { userId: aluno.userId },
    data: {
      addressStreet: cleanAddressText(identity.addressStreet),
      addressNumber: cleanAddressText(identity.addressNumber),
      addressComplement: cleanAddressText(identity.addressComplement),
      addressNeighborhood: cleanAddressText(identity.addressNeighborhood),
      addressCity: cleanAddressText(identity.addressCity),
      addressState: cleanAddressText(identity.addressState),
      addressZipCode: cleanAddressText(identity.addressZipCode),
    },
  });

  return true;
}

async function transitionEnrollmentStatusInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  from: StudentLifecycleStatus,
  to: StudentLifecycleStatus,
  input: EnrollmentTransitionInput,
  alunoUpdate: Prisma.AlunoUpdateManyMutationInput,
  onboardingUpdate: Prisma.StudentOnboardingProcessUpdateManyMutationInput,
  additionalEvent: 'ADMIN_REVIEWED' | 'CONVERTED_TO_ACTIVE_STUDENT'
): Promise<Aluno> {
  assertValidStudentLifecycleTransition(from, to);
  const updated = await tx.aluno.updateMany({
    where: { id: alunoId, contractId, status: from },
    data: { status: to, ...alunoUpdate },
  });
  if (updated.count !== 1) {
    const current = await tx.aluno.findFirst({
      where: { id: alunoId, contractId },
      select: { status: true },
    });
    if (!current) throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    throw new StudentLifecycleError(
      'O cadastro foi alterado por outra operação. Recarregue antes de continuar.',
      'CONCURRENT_MODIFICATION',
      { expectedStatus: from, currentStatus: current.status }
    );
  }

  const onboarding = await tx.studentOnboardingProcess.updateMany({
    where: { alunoId, contractId },
    data: onboardingUpdate,
  });
  if (onboarding.count !== 1) {
    throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
  }

  for (const eventType of ['STATUS_CHANGED', additionalEvent] as const) {
    await tx.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType,
        actorUserId: input.actor.userId,
        actorProfessorId: input.actor.professorId,
        metadata: { from, to, ...input.metadata },
      },
    });
  }

  return tx.aluno.findUniqueOrThrow({ where: { id: alunoId } });
}

export async function markStudentReadyForEnrollmentInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  input: EnrollmentTransitionInput
): Promise<Aluno> {
  const aluno = await tx.aluno.findFirst({
    where: { id: alunoId, contractId },
    include: { onboarding: true },
  });
  if (!aluno || !aluno.onboarding) {
    throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  }
  await assertProfessorInContract(tx, input.actor.professorId, contractId);

  if (
    !hasCurrentPreRegistrationConsent(
      aluno.onboarding.privacyNoticeVersion,
      aluno.onboarding.privacyAcceptedAt
    )
  ) {
    throw new StudentLifecycleError(
      'O consentimento vigente deve estar registrado antes da revisão.',
      'PRECONDITION_FAILED',
      {
        acceptedVersion: aluno.onboarding.privacyNoticeVersion,
        requiredVersion: PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
      }
    );
  }
  const identity = await loadStudentIdentity(alunoId, contractId, tx);
  const missing = findMissingPreRegistrationFields({
    name: identity.name ?? undefined,
    phone: identity.phone ?? undefined,
    email: identity.email ?? undefined,
    birthDate: identity.birthDate ?? undefined,
    privacyNoticeVersion: aluno.onboarding.privacyNoticeVersion ?? undefined,
    privacyAcceptedAt: aluno.onboarding.privacyAcceptedAt ?? undefined,
  });
  if (missing.length > 0) {
    throw new StudentLifecycleError(
      'O cadastro ainda possui campos obrigatórios pendentes.',
      'MISSING_REQUIRED_FIELDS',
      { fields: missing }
    );
  }

  return transitionEnrollmentStatusInTransaction(
    tx,
    alunoId,
    contractId,
    'PRE_REGISTRATION_COMPLETED',
    'READY_FOR_ENROLLMENT',
    input,
    { readyForEnrollmentAt: new Date() },
    { reviewedAt: new Date(), reviewedByProfessorId: input.actor.professorId },
    'ADMIN_REVIEWED'
  );
}

export async function activateStudentEnrollmentInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  input: EnrollmentTransitionInput
): Promise<Aluno> {
  const aluno = await tx.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: { userId: true },
  });
  if (!aluno) throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  await assertProfessorInContract(tx, input.actor.professorId, contractId);
  if (!aluno.userId) {
    throw new StudentLifecycleError(
      'É necessário vincular uma conta válida antes da ativação.',
      'PRECONDITION_FAILED'
    );
  }

  const legacyAddressProjected =
    await syncStudentAddressLegacyProfileProjectionInTransaction(tx, alunoId, contractId);

  return transitionEnrollmentStatusInTransaction(
    tx,
    alunoId,
    contractId,
    'READY_FOR_ENROLLMENT',
    'ACTIVE_STUDENT',
    {
      ...input,
      metadata: {
        ...input.metadata,
        legacyAddressProjected,
      },
    },
    { activatedAt: new Date() },
    { convertedAt: new Date() },
    'CONVERTED_TO_ACTIVE_STUDENT'
  );
}
