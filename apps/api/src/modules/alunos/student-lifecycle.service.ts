import { Prisma, PrismaClient, type Aluno } from '@prisma/client';
import {
  STUDENT_LIFECYCLE_TRANSITIONS,
  isValidStudentLifecycleTransition,
  type StudentLifecycleStatus,
  type StudentLifecycleEventType,
} from '@corrida/types';

const prisma = new PrismaClient();

/**
 * Service de dominio do ciclo unico lead -> aluno (issue #268).
 *
 * Regra inegociavel: nenhuma alteracao de `Aluno.status` pode acontecer fora
 * deste arquivo. Handlers HTTP e outros services devem chamar as funcoes
 * abaixo em vez de escrever `status` diretamente via Prisma.
 */

export class StudentLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_TRANSITION'
      | 'MISSING_REQUIRED_FIELDS'
      | 'IDENTIFIER_CONFLICT'
      | 'NOT_FOUND'
      | 'ACCOUNT_ALREADY_LINKED'
  ) {
    super(message);
    this.name = 'StudentLifecycleError';
  }
}

// --- Normalizacao de identificadores (fonte unica para todo o dominio) ---

export function normalizeLeadEmail(email?: string | null): string | undefined {
  if (typeof email !== 'string') return undefined;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeLeadPhone(phone?: string | null): string | undefined {
  if (typeof phone !== 'string') return undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

export function normalizeLeadCpf(cpf?: string | null): string | undefined {
  if (typeof cpf !== 'string') return undefined;
  const digits = cpf.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

/** Deriva idade a partir do nascimento. Nunca persistir um valor inventado. */
export function deriveAgeFromBirthDate(birthDate: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

// --- Transicoes de estado ---

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

const UNIQUE_FIELD_BY_CONSTRAINT: Record<string, 'email' | 'phone' | 'cpf'> = {
  Aluno_contractId_leadEmailNormalized_key: 'email',
  Aluno_contractId_leadPhoneNormalized_key: 'phone',
  Aluno_contractId_leadCpfNormalized_key: 'cpf',
};

function toIdentifierConflict(error: unknown): StudentLifecycleError | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = Array.isArray(error.meta?.target)
      ? (error.meta?.target as string[]).join('_')
      : String(error.meta?.target ?? '');
    const matchedField = Object.entries(UNIQUE_FIELD_BY_CONSTRAINT).find(([constraint]) =>
      target.includes(constraint)
    )?.[1];
    return new StudentLifecycleError(
      `Já existe um registro com este ${matchedField ?? 'identificador'} neste contrato.`,
      'IDENTIFIER_CONFLICT'
    );
  }
  return null;
}

// --- Criacao de lead ---

export interface CreateLeadInput {
  contractId: string;
  name: string;
  phone?: string;
  email?: string;
  origin: string;
  createdByProfessorId?: string;
}

export async function createStudentLead(input: CreateLeadInput): Promise<Aluno> {
  const leadPhoneNormalized = normalizeLeadPhone(input.phone);
  const leadEmailNormalized = normalizeLeadEmail(input.email);

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new StudentLifecycleError('Nome é obrigatório para criar um lead.', 'MISSING_REQUIRED_FIELDS');
  }
  if (!leadPhoneNormalized && !leadEmailNormalized) {
    throw new StudentLifecycleError(
      'É necessário informar ao menos telefone ou e-mail para criar um lead.',
      'MISSING_REQUIRED_FIELDS'
    );
  }
  if (!input.origin || input.origin.trim().length === 0) {
    throw new StudentLifecycleError('Origem do lead é obrigatória.', 'MISSING_REQUIRED_FIELDS');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const aluno = await tx.aluno.create({
        data: {
          contractId: input.contractId,
          status: 'LEAD',
          leadName: trimmedName,
          leadPhone: input.phone?.trim() || undefined,
          leadPhoneNormalized,
          leadEmail: input.email?.trim() || undefined,
          leadEmailNormalized,
          leadOrigin: input.origin.trim(),
          createdByProfessorId: input.createdByProfessorId,
        },
      });

      await tx.studentOnboardingProcess.create({
        data: {
          alunoId: aluno.id,
          contractId: input.contractId,
        },
      });

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: aluno.id,
          contractId: input.contractId,
          eventType: 'LEAD_CREATED',
          actorProfessorId: input.createdByProfessorId,
          metadata: { origin: input.origin.trim() },
        },
      });

      return aluno;
    });
  } catch (error) {
    const conflict = toIdentifierConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
}

// --- Busca tenant-scoped (evita revelar existencia cross-tenant) ---

async function findAlunoInContractOrThrow(alunoId: string, contractId: string) {
  const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, contractId } });
  if (!aluno) {
    throw new StudentLifecycleError('Registro não encontrado.', 'NOT_FOUND');
  }
  return aluno;
}

// --- Transicao generica de status ---

export async function transitionStudentLifecycleStatus(
  alunoId: string,
  contractId: string,
  to: StudentLifecycleStatus,
  actor: { userId?: string; professorId?: string } = {},
  metadata?: Record<string, unknown>
): Promise<Aluno> {
  const aluno = await findAlunoInContractOrThrow(alunoId, contractId);
  assertValidStudentLifecycleTransition(aluno.status as StudentLifecycleStatus, to);

  return prisma.$transaction(async (tx) => {
    const updateData: Prisma.AlunoUpdateInput = { status: to };
    if (to === 'READY_FOR_ENROLLMENT') updateData.readyForEnrollmentAt = new Date();
    if (to === 'ACTIVE_STUDENT') updateData.activatedAt = new Date();
    if (to === 'INVITED') updateData.invitedAt = new Date();

    const updated = await tx.aluno.update({ where: { id: alunoId }, data: updateData });

    // Issue #268 (achado de auditoria): a tabela de processo
    // (StudentOnboardingProcess) precisa refletir os marcos do ciclo, não
    // apenas existir. Cada transição relevante atualiza o timestamp de
    // processo correspondente.
    const onboardingUpdate: Prisma.StudentOnboardingProcessUpdateManyMutationInput = {};
    if (to === 'PRE_REGISTRATION_IN_PROGRESS') onboardingUpdate.startedAt = new Date();
    if (to === 'PRE_REGISTRATION_COMPLETED') onboardingUpdate.completedAt = new Date();
    if (to === 'READY_FOR_ENROLLMENT') onboardingUpdate.reviewedAt = new Date();
    if (to === 'READY_FOR_ENROLLMENT' && actor.professorId) {
      onboardingUpdate.reviewedByProfessorId = actor.professorId;
    }
    if (to === 'ACTIVE_STUDENT') onboardingUpdate.convertedAt = new Date();
    if (Object.keys(onboardingUpdate).length > 0) {
      await tx.studentOnboardingProcess.updateMany({
        where: { alunoId },
        data: onboardingUpdate,
      });
    }

    const events: StudentLifecycleEventType[] = ['STATUS_CHANGED'];
    if (to === 'READY_FOR_ENROLLMENT') events.push('ADMIN_REVIEWED');
    if (to === 'ACTIVE_STUDENT') events.push('CONVERTED_TO_ACTIVE_STUDENT');

    for (const eventType of events) {
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId,
          eventType,
          actorUserId: actor.userId,
          actorProfessorId: actor.professorId,
          metadata: { from: aluno.status, to, ...metadata },
        },
      });
    }

    return updated;
  });
}

/**
 * Registra progresso incremental do pré-cadastro (salvamento parcial) sem
 * mudar de estado. Usado pelas telas de onboarding (#270+) para manter
 * `lastSavedAt`/`formVersion`/consentimento atualizados durante o
 * preenchimento, antes da conclusão.
 */
export async function recordStudentOnboardingProgress(
  alunoId: string,
  contractId: string,
  progress: {
    formVersion?: string;
    privacyNoticeVersion?: string;
    privacyAcceptedAt?: Date;
  }
): Promise<void> {
  await findAlunoInContractOrThrow(alunoId, contractId);
  await prisma.studentOnboardingProcess.updateMany({
    where: { alunoId },
    data: {
      ...progress,
      lastSavedAt: new Date(),
    },
  });
}

// --- Vinculo de conta (claim) — transacional e idempotente ---

export async function claimAccountForStudentLead(
  alunoId: string,
  contractId: string,
  userId: string
): Promise<Aluno> {
  const aluno = await findAlunoInContractOrThrow(alunoId, contractId);

  if (aluno.userId === userId) {
    // Idempotente: reivindicação repetida pela mesma conta não é erro.
    return aluno;
  }

  if (aluno.userId && aluno.userId !== userId) {
    throw new StudentLifecycleError(
      'Este registro já possui uma conta vinculada.',
      'ACCOUNT_ALREADY_LINKED'
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.aluno.update({
        where: { id: alunoId },
        data: { userId },
      });

      await tx.studentOnboardingProcess.updateMany({
        where: { alunoId },
        data: { claimedByUserId: userId, claimedAt: new Date() },
      });

      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId,
          eventType: 'ACCOUNT_LINKED',
          actorUserId: userId,
        },
      });

      return updated;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Corrida concorrente: outra transação já vinculou este userId primeiro.
      throw new StudentLifecycleError(
        'Esta conta já está vinculada a outro registro.',
        'ACCOUNT_ALREADY_LINKED'
      );
    }
    throw error;
  }
}

// --- Requisitos minimos por estagio ---

export interface PreRegistrationData {
  name?: string | null;
  birthDate?: Date | null;
  phone?: string | null;
  email?: string | null;
  privacyNoticeVersion?: string | null;
  privacyAcceptedAt?: Date | null;
}

export function findMissingPreRegistrationFields(data: PreRegistrationData): string[] {
  const missing: string[] = [];
  if (!data.name || data.name.trim().length === 0) missing.push('name');
  if (!data.birthDate) missing.push('birthDate');
  if (!normalizeLeadPhone(data.phone) && !normalizeLeadEmail(data.email)) missing.push('phone_or_email');
  if (!data.privacyNoticeVersion) missing.push('privacyNoticeVersion');
  if (!data.privacyAcceptedAt) missing.push('privacyAcceptedAt');
  return missing;
}

export async function completeStudentPreRegistration(
  alunoId: string,
  contractId: string,
  data: PreRegistrationData
): Promise<Aluno> {
  const missing = findMissingPreRegistrationFields(data);
  if (missing.length > 0) {
    throw new StudentLifecycleError(
      `Campos obrigatórios ausentes para concluir o pré-cadastro: ${missing.join(', ')}.`,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  if (data.privacyNoticeVersion || data.privacyAcceptedAt) {
    await prisma.studentOnboardingProcess.updateMany({
      where: { alunoId },
      data: {
        privacyNoticeVersion: data.privacyNoticeVersion ?? undefined,
        privacyAcceptedAt: data.privacyAcceptedAt ?? undefined,
      },
    });
  }

  return transitionStudentLifecycleStatus(alunoId, contractId, 'PRE_REGISTRATION_COMPLETED');
}

// --- Descarte e reabertura ---

export async function discardStudentLead(
  alunoId: string,
  contractId: string,
  reason: string,
  actorProfessorId: string
): Promise<Aluno> {
  if (!reason || reason.trim().length === 0) {
    throw new StudentLifecycleError('Motivo do descarte é obrigatório.', 'MISSING_REQUIRED_FIELDS');
  }

  const aluno = await findAlunoInContractOrThrow(alunoId, contractId);
  assertValidStudentLifecycleTransition(aluno.status as StudentLifecycleStatus, 'DISCARDED');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aluno.update({
      where: { id: alunoId },
      data: {
        status: 'DISCARDED',
        discardedAt: new Date(),
        discardReason: reason.trim(),
        discardedByProfessorId: actorProfessorId,
      },
    });

    await tx.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType: 'DISCARDED',
        actorProfessorId,
        metadata: { reason: reason.trim(), from: aluno.status },
      },
    });

    return updated;
  });
}

export async function reopenDiscardedStudentLead(
  alunoId: string,
  contractId: string,
  actorProfessorId: string
): Promise<Aluno> {
  const aluno = await findAlunoInContractOrThrow(alunoId, contractId);
  assertValidStudentLifecycleTransition(aluno.status as StudentLifecycleStatus, 'LEAD');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aluno.update({
      where: { id: alunoId },
      data: { status: 'LEAD' },
    });

    await tx.studentOnboardingProcess.updateMany({
      where: { alunoId },
      data: { reopenedAt: new Date() },
    });

    await tx.studentLifecycleEvent.create({
      data: {
        alunoId,
        contractId,
        eventType: 'REOPENED',
        actorProfessorId,
      },
    });

    return updated;
  });
}

/** Filtro padrão para queries que devem enxergar somente alunos ativos. */
export const ACTIVE_STUDENT_WHERE = { status: 'ACTIVE_STUDENT' as const };

/**
 * Único ponto autorizado a decidir os campos de status/ativação para o
 * fluxo de criação administrativa/comercial LEGADO (que sempre cria o aluno
 * já com conta, professor e dados completos — não passa pelo ciclo
 * lead -> aluno desta issue). Nenhum outro arquivo deve escrever
 * `status`/`activatedAt` de Aluno diretamente: mesmo esta criação direta
 * consulta este helper para que a decisão fique centralizada aqui.
 */
export function legacyDirectActiveStudentCreationFields(): {
  status: 'ACTIVE_STUDENT';
  activatedAt: Date;
} {
  return { status: 'ACTIVE_STUDENT', activatedAt: new Date() };
}
