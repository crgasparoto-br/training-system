import { Prisma, PrismaClient, type Aluno } from '@prisma/client';
import {
  PRE_REGISTRATION_REQUIRED_FIELDS,
  STUDENT_LIFECYCLE_TRANSITIONS,
  isValidStudentLifecycleTransition,
  type CreateStudentLeadDTO,
  type StudentActivationTransitionDTO,
  type StudentAdministrativeReviewTransitionDTO,
  type StudentInvitationTransitionDTO,
  type StudentLifecycleActorDTO,
  type StudentLifecycleErrorCode,
  type StudentLifecycleEventType,
  type StudentLifecycleStatus,
  type UpdateStudentPreRegistrationDTO,
} from '@corrida/types';
import {
  deriveAgeFromBirthDate,
  findStudentAccountIdentityMismatches,
  normalizeStudentCpf,
  normalizeStudentEmail,
  normalizeStudentPhone,
  upsertStudentIdentity,
} from './student-identity.service.js';

const prisma = new PrismaClient();
type DbClient = Prisma.TransactionClient | PrismaClient;

export {
  deriveAgeFromBirthDate,
  normalizeStudentCpf as normalizeLeadCpf,
  normalizeStudentEmail as normalizeLeadEmail,
  normalizeStudentPhone as normalizeLeadPhone,
};

/**
 * Service de domínio do ciclo único lead -> aluno (issue #268).
 *
 * Nenhuma alteração de `Aluno.status` pode acontecer fora deste arquivo.
 * Transições que possuem pré-condições próprias são expostas apenas por funções
 * específicas; não existe mutação genérica pública capaz de contorná-las.
 */
export class StudentLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: StudentLifecycleErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StudentLifecycleError';
  }
}

export function assertValidStudentLifecycleTransition(
  from: StudentLifecycleStatus,
  to: StudentLifecycleStatus
) {
  if (!isValidStudentLifecycleTransition(from, to)) {
    throw new StudentLifecycleError(
      `Transição inválida de ${from} para ${to}. Transições permitidas: ${STUDENT_LIFECYCLE_TRANSITIONS[from].join(', ') || 'nenhuma'}.`,
      'INVALID_TRANSITION'
    );
  }
}

const UNIQUE_FIELD_BY_TARGET: Record<string, 'cpf' | 'account'> = {
  Aluno_contractId_leadCpfNormalized_key: 'cpf',
  Aluno_contractId_userId_key: 'account',
  contractId_leadCpfNormalized: 'cpf',
  contractId_userId: 'account',
};

function toDomainConflict(error: unknown): StudentLifecycleError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }

  const target = Array.isArray(error.meta?.target)
    ? (error.meta?.target as string[]).join('_')
    : String(error.meta?.target ?? '');
  const field = Object.entries(UNIQUE_FIELD_BY_TARGET).find(([key]) => target.includes(key))?.[1];

  if (field === 'account') {
    return new StudentLifecycleError(
      'Esta conta já está vinculada a outro cadastro neste contrato.',
      'ACCOUNT_CONTRACT_CONFLICT'
    );
  }

  return new StudentLifecycleError(
    'Já existe um cadastro com este CPF neste contrato.',
    'IDENTIFIER_CONFLICT',
    { field: 'cpf' }
  );
}

const requiredText = (value: string | undefined, field: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new StudentLifecycleError(`${field} é obrigatório.`, 'MISSING_REQUIRED_FIELDS', {
      fields: [field],
    });
  }
  return trimmed;
};

async function assertProfessorInContract(
  professorId: string | undefined,
  contractId: string,
  client: DbClient
) {
  if (!professorId) return;
  const professor = await client.professor.findFirst({
    where: { id: professorId, contractId },
    select: { id: true },
  });
  if (!professor) {
    throw new StudentLifecycleError('Responsável não encontrado.', 'NOT_FOUND');
  }
}

export async function createStudentLead(input: CreateStudentLeadDTO): Promise<Aluno> {
  const name = requiredText(input.name, 'name');
  const origin = requiredText(input.origin, 'origin');
  const phoneNormalized = normalizeStudentPhone(input.phone);
  const emailNormalized = normalizeStudentEmail(input.email);

  if (!phoneNormalized && !emailNormalized) {
    throw new StudentLifecycleError(
      'É necessário informar ao menos telefone ou e-mail para criar um lead.',
      'MISSING_REQUIRED_FIELDS',
      { fields: ['phone_or_email'] }
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await assertProfessorInContract(input.createdByProfessorId, input.contractId, tx);

      const aluno = await tx.aluno.create({
        data: {
          contractId: input.contractId,
          status: 'LEAD',
          leadOrigin: origin,
          createdByProfessorId: input.createdByProfessorId,
        },
      });

      await tx.studentOnboardingProcess.create({
        data: { alunoId: aluno.id, contractId: input.contractId },
      });

      await upsertStudentIdentity(
        aluno.id,
        input.contractId,
        { name, phone: input.phone, email: input.email },
        {
          client: tx,
          actor: { professorId: input.createdByProfessorId },
          sourceType: 'professional',
          sourceReference: 'lead_creation',
          emitAuditEvent: false,
        }
      );

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: aluno.id,
          contractId: input.contractId,
          eventType: 'LEAD_CREATED',
          actorProfessorId: input.createdByProfessorId,
          metadata: { origin },
        },
      });

      return tx.aluno.findUniqueOrThrow({ where: { id: aluno.id } });
    });
  } catch (error) {
    const conflict = toDomainConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
}

async function findAlunoInContractOrThrow(
  alunoId: string,
  contractId: string,
  client: DbClient = prisma
) {
  const aluno = await client.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  }
  return aluno;
}

type TransitionOptions = {
  actor?: StudentLifecycleActorDTO;
  metadata?: Record<string, unknown>;
  alunoUpdate?: Prisma.AlunoUpdateManyMutationInput;
  onboardingUpdate?: Prisma.StudentOnboardingProcessUpdateManyMutationInput;
  additionalEvents?: StudentLifecycleEventType[];
};

async function transitionStudentLifecycleStatusInTransaction(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  from: StudentLifecycleStatus,
  to: StudentLifecycleStatus,
  options: TransitionOptions = {}
): Promise<Aluno> {
  assertValidStudentLifecycleTransition(from, to);

  const updated = await tx.aluno.updateMany({
    where: { id: alunoId, contractId, status: from },
    data: { status: to, ...options.alunoUpdate },
  });

  if (updated.count !== 1) {
    const current = await tx.aluno.findFirst({ where: { id: alunoId, contractId } });
    if (!current) {
      throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    }
    throw new StudentLifecycleError(
      'O cadastro foi alterado por outra operação. Recarregue antes de continuar.',
      'CONCURRENT_MODIFICATION',
      { expectedStatus: from, currentStatus: current.status }
    );
  }

  if (options.onboardingUpdate && Object.keys(options.onboardingUpdate).length > 0) {
    const onboarding = await tx.studentOnboardingProcess.updateMany({
      where: { alunoId, contractId },
      data: options.onboardingUpdate,
    });
    if (onboarding.count !== 1) {
      throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
    }
  }

  const events: StudentLifecycleEventType[] = [
    'STATUS_CHANGED',
    ...(options.additionalEvents ?? []),
  ];
  for (const eventType of events) {
    await tx.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType,
        actorUserId: options.actor?.userId,
        actorProfessorId: options.actor?.professorId,
        metadata: { from, to, ...options.metadata },
      },
    });
  }

  return tx.aluno.findUniqueOrThrow({ where: { id: alunoId } });
}

export async function recordStudentInvitationCreated(
  alunoId: string,
  contractId: string,
  input: StudentInvitationTransitionDTO
): Promise<Aluno> {
  const invitationId = requiredText(input.invitationId, 'invitationId');
  return prisma.$transaction(async (tx) => {
    const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);
    await assertProfessorInContract(input.actor.professorId, contractId, tx);
    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'INVITED',
      {
        actor: input.actor,
        alunoUpdate: { invitedAt: new Date() },
        metadata: { invitationId },
      }
    );
  });
}

export async function recordStudentOnboardingProgress(
  alunoId: string,
  contractId: string,
  progress: {
    formVersion?: string;
    privacyNoticeVersion?: string;
    privacyAcceptedAt?: Date;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await findAlunoInContractOrThrow(alunoId, contractId, tx);
    const updated = await tx.studentOnboardingProcess.updateMany({
      where: { alunoId, contractId },
      data: { ...progress, lastSavedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
    }
  });
}

export async function claimAccountForStudentLead(
  alunoId: string,
  contractId: string,
  userId: string
): Promise<Aluno> {
  try {
    return await prisma.$transaction(async (tx) => {
      const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);

      if (aluno.userId === userId) return aluno;
      if (aluno.userId) {
        throw new StudentLifecycleError(
          'Este cadastro já possui uma conta vinculada.',
          'ACCOUNT_ALREADY_LINKED'
        );
      }

      const mismatches = await findStudentAccountIdentityMismatches(
        alunoId,
        contractId,
        userId,
        tx
      );
      if (mismatches.length > 0) {
        throw new StudentLifecycleError(
          'Os dados da conta divergem do cadastro. A reconciliação deve ser confirmada explicitamente.',
          'ACCOUNT_DATA_MISMATCH',
          { fields: mismatches }
        );
      }

      const existingInContract = await tx.aluno.findFirst({
        where: { contractId, userId, id: { not: alunoId } },
        select: { id: true },
      });
      if (existingInContract) {
        throw new StudentLifecycleError(
          'Esta conta já está vinculada a outro cadastro neste contrato.',
          'ACCOUNT_CONTRACT_CONFLICT'
        );
      }

      const claimed = await tx.aluno.updateMany({
        where: { id: alunoId, contractId, userId: null },
        data: { userId },
      });

      if (claimed.count !== 1) {
        const current = await findAlunoInContractOrThrow(alunoId, contractId, tx);
        if (current.userId === userId) return current;
        throw new StudentLifecycleError(
          'Este cadastro foi reivindicado por outra conta.',
          'ACCOUNT_ALREADY_LINKED'
        );
      }

      const onboarding = await tx.studentOnboardingProcess.updateMany({
        where: { alunoId, contractId },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      });
      if (onboarding.count !== 1) {
        throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId,
          eventType: 'ACCOUNT_LINKED',
          actorUserId: userId,
        },
      });

      return tx.aluno.findUniqueOrThrow({ where: { id: alunoId } });
    });
  } catch (error) {
    if (error instanceof StudentLifecycleError) throw error;
    const conflict = toDomainConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
}

export async function startStudentPreRegistration(
  alunoId: string,
  contractId: string,
  userId: string
): Promise<Aluno> {
  return prisma.$transaction(async (tx) => {
    const aluno = await tx.aluno.findFirst({
      where: { id: alunoId, contractId },
      include: { onboarding: true },
    });
    if (!aluno) throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    if (aluno.userId !== userId || aluno.onboarding?.claimedByUserId !== userId) {
      throw new StudentLifecycleError(
        'A conta autenticada não reivindicou este cadastro.',
        'PRECONDITION_FAILED'
      );
    }

    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'PRE_REGISTRATION_IN_PROGRESS',
      {
        actor: { userId },
        onboardingUpdate: { startedAt: aluno.onboarding.startedAt ?? new Date() },
      }
    );
  });
}

export type PreRegistrationData = Omit<
  UpdateStudentPreRegistrationDTO,
  'birthDate' | 'privacyAcceptedAt'
> & {
  birthDate?: string | Date;
  privacyAcceptedAt?: string | Date;
};

export function findMissingPreRegistrationFields(data: PreRegistrationData): string[] {
  const missing: string[] = [];
  if (!data.name?.trim()) missing.push('name');
  if (!data.birthDate) missing.push('birthDate');
  if (!normalizeStudentPhone(data.phone)) missing.push('phone');
  if (!data.privacyNoticeVersion?.trim()) missing.push('privacyNoticeVersion');
  if (!data.privacyAcceptedAt) missing.push('privacyAcceptedAt');
  return missing.filter((field) =>
    (PRE_REGISTRATION_REQUIRED_FIELDS as readonly string[]).includes(field)
  );
}

export async function completeStudentPreRegistration(
  alunoId: string,
  contractId: string,
  data: PreRegistrationData,
  actorUserId?: string
): Promise<Aluno> {
  const missing = findMissingPreRegistrationFields(data);
  if (missing.length > 0) {
    throw new StudentLifecycleError(
      `Campos obrigatórios ausentes para concluir o pré-cadastro: ${missing.join(', ')}.`,
      'MISSING_REQUIRED_FIELDS',
      { fields: missing }
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);
      if (actorUserId && aluno.userId !== actorUserId) {
        throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
      }

      const privacyAcceptedAt = new Date(data.privacyAcceptedAt!);
      if (Number.isNaN(privacyAcceptedAt.getTime())) {
        throw new StudentLifecycleError(
          'Data do aceite de privacidade inválida.',
          'MISSING_REQUIRED_FIELDS',
          { fields: ['privacyAcceptedAt'] }
        );
      }

      await upsertStudentIdentity(
        alunoId,
        contractId,
        {
          name: data.name,
          birthDate: data.birthDate,
          phone: data.phone,
          email: data.email,
          cpf: data.cpf,
          addressStreet: data.addressStreet,
          addressNumber: data.addressNumber,
          addressComplement: data.addressComplement,
          addressNeighborhood: data.addressNeighborhood,
          addressCity: data.addressCity,
          addressState: data.addressState,
          addressZipCode: data.addressZipCode,
          guardianName: data.guardianName,
          guardianCpf: data.guardianCpf,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail,
        },
        {
          client: tx,
          actor: { userId: actorUserId },
          sourceType: 'student',
          sourceReference: 'pre_registration',
          syncLegacyProfile: true,
        }
      );

      const onboarding = await tx.studentOnboardingProcess.updateMany({
        where: { alunoId, contractId },
        data: {
          privacyNoticeVersion: data.privacyNoticeVersion!.trim(),
          privacyAcceptedAt,
          lastSavedAt: new Date(),
        },
      });
      if (onboarding.count !== 1) {
        throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
      }

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId,
          eventType: 'PRIVACY_CONSENT_RECORDED',
          actorUserId,
          metadata: { noticeVersion: data.privacyNoticeVersion!.trim() },
        },
      });

      return transitionStudentLifecycleStatusInTransaction(
        tx,
        alunoId,
        contractId,
        aluno.status as StudentLifecycleStatus,
        'PRE_REGISTRATION_COMPLETED',
        {
          actor: { userId: actorUserId },
          onboardingUpdate: { completedAt: new Date() },
          additionalEvents: ['PRE_REGISTRATION_COMPLETED'],
        }
      );
    });
  } catch (error) {
    if (error instanceof StudentLifecycleError) throw error;
    const conflict = toDomainConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
}

export async function markStudentReadyForEnrollment(
  alunoId: string,
  contractId: string,
  input: StudentAdministrativeReviewTransitionDTO
): Promise<Aluno> {
  const reviewReference = requiredText(input.reviewReference, 'reviewReference');
  const deduplicationReference = requiredText(
    input.deduplicationReference,
    'deduplicationReference'
  );

  return prisma.$transaction(async (tx) => {
    const aluno = await tx.aluno.findFirst({
      where: { id: alunoId, contractId },
      include: { onboarding: true, studentProfile: true },
    });
    if (!aluno) throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
    await assertProfessorInContract(input.actor.professorId, contractId, tx);

    if (!aluno.onboarding?.privacyAcceptedAt || !aluno.onboarding.privacyNoticeVersion) {
      throw new StudentLifecycleError(
        'O consentimento vigente deve estar registrado antes da revisão.',
        'PRECONDITION_FAILED'
      );
    }

    const identity =
      aluno.studentProfile?.identificationData &&
      typeof aluno.studentProfile.identificationData === 'object' &&
      !Array.isArray(aluno.studentProfile.identificationData)
        ? (aluno.studentProfile.identificationData as Record<string, unknown>)
        : {};
    const missing = findMissingPreRegistrationFields({
      name: typeof identity.name === 'string' ? identity.name : undefined,
      phone: typeof identity.phone === 'string' ? identity.phone : undefined,
      birthDate: typeof identity.birthDate === 'string' ? identity.birthDate : undefined,
      privacyNoticeVersion: aluno.onboarding.privacyNoticeVersion,
      privacyAcceptedAt: aluno.onboarding.privacyAcceptedAt,
    });
    if (missing.length > 0) {
      throw new StudentLifecycleError(
        'O cadastro ainda possui campos obrigatórios pendentes.',
        'MISSING_REQUIRED_FIELDS',
        { fields: missing }
      );
    }

    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'READY_FOR_ENROLLMENT',
      {
        actor: input.actor,
        alunoUpdate: { readyForEnrollmentAt: new Date() },
        onboardingUpdate: {
          reviewedAt: new Date(),
          reviewedByProfessorId: input.actor.professorId,
        },
        metadata: { reviewReference, deduplicationReference },
        additionalEvents: ['ADMIN_REVIEWED'],
      }
    );
  });
}

export async function activateStudentEnrollment(
  alunoId: string,
  contractId: string,
  input: StudentActivationTransitionDTO
): Promise<Aluno> {
  const activationReference = requiredText(input.activationReference, 'activationReference');
  return prisma.$transaction(async (tx) => {
    const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);
    await assertProfessorInContract(input.actor.professorId, contractId, tx);
    if (!aluno.userId) {
      throw new StudentLifecycleError(
        'É necessário vincular uma conta válida antes da ativação.',
        'PRECONDITION_FAILED'
      );
    }

    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'ACTIVE_STUDENT',
      {
        actor: input.actor,
        alunoUpdate: { activatedAt: new Date() },
        onboardingUpdate: { convertedAt: new Date() },
        metadata: { activationReference },
        additionalEvents: ['CONVERTED_TO_ACTIVE_STUDENT'],
      }
    );
  });
}

export async function discardStudentLead(
  alunoId: string,
  contractId: string,
  reason: string,
  actorProfessorId: string
): Promise<Aluno> {
  const normalizedReason = requiredText(reason, 'reason');
  return prisma.$transaction(async (tx) => {
    const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);
    await assertProfessorInContract(actorProfessorId, contractId, tx);
    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'DISCARDED',
      {
        actor: { professorId: actorProfessorId },
        alunoUpdate: {
          discardedAt: new Date(),
          discardReason: normalizedReason,
          discardedByProfessorId: actorProfessorId,
        },
        metadata: { reason: normalizedReason },
        additionalEvents: ['DISCARDED'],
      }
    );
  });
}

export async function reopenDiscardedStudentLead(
  alunoId: string,
  contractId: string,
  reason: string,
  actorProfessorId: string
): Promise<Aluno> {
  const normalizedReason = requiredText(reason, 'reason');
  return prisma.$transaction(async (tx) => {
    const aluno = await findAlunoInContractOrThrow(alunoId, contractId, tx);
    await assertProfessorInContract(actorProfessorId, contractId, tx);
    return transitionStudentLifecycleStatusInTransaction(
      tx,
      alunoId,
      contractId,
      aluno.status as StudentLifecycleStatus,
      'LEAD',
      {
        actor: { professorId: actorProfessorId },
        onboardingUpdate: { reopenedAt: new Date(), reopenReason: normalizedReason },
        metadata: { reason: normalizedReason },
        additionalEvents: ['REOPENED'],
      }
    );
  });
}

export const ACTIVE_STUDENT_WHERE = { status: 'ACTIVE_STUDENT' as const };

export function legacyDirectActiveStudentCreationFields(): {
  status: 'ACTIVE_STUDENT';
  activatedAt: Date;
} {
  return { status: 'ACTIVE_STUDENT', activatedAt: new Date() };
}
