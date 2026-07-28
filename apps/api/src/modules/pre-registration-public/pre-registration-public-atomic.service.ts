import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CompletePreRegistrationDTO,
  PreRegistrationClaimRole,
  PreRegistrationGuardianAuthorizationDTO,
  PreRegistrationPublicErrorCode,
  PreRegistrationPublicTenantDTO,
  PreRegistrationSessionDTO,
  PreRegistrationStep,
  SavePreRegistrationStepDTO,
  StudentLifecycleStatus,
} from '@corrida/types';
import {
  assertValidStudentLifecycleTransition,
  findMissingPreRegistrationFields,
  StudentLifecycleError,
} from '../alunos/student-lifecycle.service.js';
import {
  completePublicStudentPreRegistration,
  startGuardianPreRegistrationInTransaction,
} from '../alunos/student-public-pre-registration.service.js';
import {
  loadStudentIdentity,
  lockStudentIdentityDeduplicationScope,
  upsertStudentIdentity,
} from '../alunos/student-identity.service.js';
import { PRE_REGISTRATION_PRIVACY_NOTICE_VERSION } from './pre-registration-policy.js';
import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';
import { PreRegistrationPublicError } from './pre-registration-public.service.js';

const prisma = new PrismaClient();
const FORM_VERSION = 'pre-registration-v1';

const ALLOWED_PRE_REGISTRATION_STATUSES: StudentLifecycleStatus[] = [
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
  'PRE_REGISTRATION_COMPLETED',
];

type LockedProcessRow = {
  id: string;
  contractId: string;
  status: StudentLifecycleStatus;
  userId: string | null;
  version: number;
  currentStep: string;
  claimRole: string;
  claimedByUserId: string | null;
  lastSavedAt: Date | null;
  completedAt: Date | null;
  privacyNoticeVersion: string | null;
  privacyAcceptedAt: Date | null;
  healthModuleStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  healthIntakeId: string | null;
  healthStartedAt: Date | null;
  healthLastSavedAt: Date | null;
  healthCompletedAt: Date | null;
  parqModuleStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
};

type GuardianAuthorizationRow = {
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  relationship: string | null;
  validatedAt: Date | null;
  revokedAt: Date | null;
  updatedAt: Date;
};

export type LockedPreRegistrationAccess = {
  alunoId: string;
  contractId: string;
  status: StudentLifecycleStatus;
  accessRole: PreRegistrationClaimRole;
  onboarding: LockedProcessRow;
};

function privacyNoticeUrl(): string {
  const configured = process.env.PRIVACY_NOTICE_URL?.trim();
  if (configured) return configured;
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${frontend}/privacidade`;
}

function isMinorBirthDate(value?: string | Date | null, now = new Date()): boolean {
  if (!value) return false;
  const birthDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(birthDate.getTime())) return false;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = now.getUTCMonth() - birthDate.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age < 18;
}

function nextStepAfter(
  step: PreRegistrationStep,
  identity: { birthDate?: string | null },
  role: PreRegistrationClaimRole
): PreRegistrationStep {
  switch (step) {
    case 'IDENTIFICATION':
      return 'CONTACT';
    case 'CONTACT':
      return 'ADDRESS';
    case 'ADDRESS':
      return isMinorBirthDate(identity.birthDate) || role === 'GUARDIAN' ? 'GUARDIAN' : 'PRIVACY';
    case 'GUARDIAN':
    case 'PRIVACY':
      return 'PRIVACY';
  }
}

function mapLifecycleError(error: unknown): never {
  if (error instanceof PreRegistrationPublicError) throw error;
  if (error instanceof StudentLifecycleError) {
    const fields = Array.isArray(error.details?.fields) ? error.details.fields : [];
    const code: PreRegistrationPublicErrorCode =
      error.code === 'CONCURRENT_MODIFICATION'
        ? 'CONCURRENT_MODIFICATION'
        : error.code === 'MISSING_REQUIRED_FIELDS'
          ? 'MISSING_REQUIRED_FIELDS'
          : error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : fields.includes('guardianAuthorization') || error.message.includes('responsável')
              ? 'GUARDIAN_AUTHORIZATION_REQUIRED'
              : 'ACCOUNT_INCOMPATIBLE';
    throw new PreRegistrationPublicError(error.message, code, error.details);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new PreRegistrationPublicError(
      'Já existe outro cadastro com este CPF. Seus dados foram preservados para revisão da academia.',
      'DUPLICATE_REVIEW_REQUIRED',
      { field: 'cpf' }
    );
  }
  throw error;
}

async function canonicalBirthDate(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<Date | null> {
  const rows = await tx.$queryRaw<Array<{ birthDate: Date | null }>>`
    SELECT COALESCE(
      CASE
        WHEN COALESCE(profile."identificationData"->>'birthDate', '')
             ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN LEFT(profile."identificationData"->>'birthDate', 10)::date
        ELSE NULL
      END,
      student."birthDate"::date
    ) AS "birthDate"
    FROM "Aluno" AS student
    LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
    WHERE student."id" = ${alunoId}
      AND student."contractId" = ${contractId}
    LIMIT 1
  `;
  return rows[0]?.birthDate ?? null;
}

async function activeGuardianAuthorizationExists(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "PreRegistrationGuardianAuthorization"
      WHERE "alunoId" = ${alunoId}
        AND "contractId" = ${contractId}
        AND "purpose" = 'PRE_REGISTRATION'
        AND "status" = 'ACTIVE'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

export async function lockAndAuthorizePreRegistrationProcess(
  tx: Prisma.TransactionClient,
  userId: string,
  alunoId: string
): Promise<LockedPreRegistrationAccess> {
  const rows = await tx.$queryRaw<LockedProcessRow[]>`
    SELECT student."id", student."contractId", student."status", student."userId",
           onboarding."version", onboarding."currentStep", onboarding."claimRole",
           onboarding."claimedByUserId", onboarding."lastSavedAt", onboarding."completedAt",
           onboarding."privacyNoticeVersion", onboarding."privacyAcceptedAt",
           onboarding."healthModuleStatus", onboarding."healthIntakeId",
           onboarding."healthStartedAt", onboarding."healthLastSavedAt",
           onboarding."healthCompletedAt", onboarding."parqModuleStatus"
    FROM "StudentOnboardingProcess" AS onboarding
    JOIN "Aluno" AS student
      ON student."id" = onboarding."alunoId"
     AND student."contractId" = onboarding."contractId"
    WHERE onboarding."alunoId" = ${alunoId}
    FOR UPDATE OF onboarding
  `;
  const row = rows[0];
  if (
    !row ||
    !ALLOWED_PRE_REGISTRATION_STATUSES.includes(row.status) ||
    row.claimedByUserId !== userId ||
    (row.claimRole !== 'STUDENT' && row.claimRole !== 'GUARDIAN')
  ) {
    throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
  }

  const birthDate = await canonicalBirthDate(tx, row.id, row.contractId);
  const isMinor = isMinorBirthDate(birthDate);
  const accessRole = row.claimRole as PreRegistrationClaimRole;

  if (accessRole === 'STUDENT') {
    if (row.userId !== userId) {
      throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
    }
    if (isMinor && !(await activeGuardianAuthorizationExists(tx, row.id, row.contractId))) {
      throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
    }
  } else {
    if (!isMinor) {
      throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
    }
    const authorization = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "PreRegistrationGuardianAuthorization"
      WHERE "alunoId" = ${row.id}
        AND "contractId" = ${row.contractId}
        AND "guardianUserId" = ${userId}
        AND "purpose" = 'PRE_REGISTRATION'
        AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (!authorization[0]) {
      throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
    }
  }

  return {
    alunoId: row.id,
    contractId: row.contractId,
    status: row.status,
    accessRole,
    onboarding: row,
  };
}

async function tenantView(
  tx: Prisma.TransactionClient,
  contractId: string
): Promise<PreRegistrationPublicTenantDTO> {
  const contract = await tx.companyContract.findUnique({
    where: { id: contractId },
    select: { name: true, tradeName: true, logoUrl: true },
  });
  if (!contract) throw new PreRegistrationPublicError('Academia não encontrada.', 'NOT_FOUND');
  return {
    name: contract.tradeName || contract.name || 'Academia',
    logoUrl: contract.logoUrl || undefined,
    privacyNoticeUrl: privacyNoticeUrl(),
  };
}

async function duplicateWarnings(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
): Promise<Array<'email' | 'phone'>> {
  const aluno = await tx.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: { leadEmailNormalized: true, leadPhoneNormalized: true },
  });
  if (!aluno) return [];
  const warnings: Array<'email' | 'phone'> = [];
  if (
    aluno.leadEmailNormalized &&
    (await tx.aluno.count({
      where: {
        contractId,
        id: { not: alunoId },
        leadEmailNormalized: aluno.leadEmailNormalized,
        status: { not: 'DISCARDED' },
      },
    })) > 0
  ) {
    warnings.push('email');
  }
  if (
    aluno.leadPhoneNormalized &&
    (await tx.aluno.count({
      where: {
        contractId,
        id: { not: alunoId },
        leadPhoneNormalized: aluno.leadPhoneNormalized,
        status: { not: 'DISCARDED' },
      },
    })) > 0
  ) {
    warnings.push('phone');
  }
  return warnings;
}

async function guardianAuthorization(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  userId: string,
  isMinor: boolean,
  role: PreRegistrationClaimRole
): Promise<PreRegistrationGuardianAuthorizationDTO> {
  if (!isMinor && role !== 'GUARDIAN') return { status: 'NOT_REQUIRED', role };

  const rows = role === 'GUARDIAN'
    ? await tx.$queryRaw<GuardianAuthorizationRow[]>`
        SELECT "status", "relationship", "validatedAt", "revokedAt", "updatedAt"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${alunoId}
          AND "contractId" = ${contractId}
          AND "guardianUserId" = ${userId}
          AND "purpose" = 'PRE_REGISTRATION'
        LIMIT 1
      `
    : await tx.$queryRaw<GuardianAuthorizationRow[]>`
        SELECT "status", NULL::text AS "relationship", "validatedAt", "revokedAt", "updatedAt"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${alunoId}
          AND "contractId" = ${contractId}
          AND "purpose" = 'PRE_REGISTRATION'
          AND "status" = 'ACTIVE'
        ORDER BY "validatedAt" DESC NULLS LAST
        LIMIT 1
      `;
  const authorization = rows[0];
  if (authorization) {
    return {
      status: authorization.status,
      role,
      relationship: authorization.relationship || undefined,
      validatedAt: authorization.validatedAt?.toISOString(),
      revokedAt: authorization.revokedAt?.toISOString(),
    };
  }
  return isMinor || role === 'GUARDIAN'
    ? { status: 'PENDING', role }
    : { status: 'NOT_REQUIRED', role };
}

async function buildSessionInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  alunoId: string
): Promise<PreRegistrationSessionDTO> {
  const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
  const identity = await loadStudentIdentity(access.alunoId, access.contractId, tx);
  const tenant = await tenantView(tx, access.contractId);
  const warnings = await duplicateWarnings(tx, access.alunoId, access.contractId);
  const authorization = await guardianAuthorization(
    tx,
    access.alunoId,
    access.contractId,
    userId,
    isMinorBirthDate(identity.birthDate),
    access.accessRole
  );
  const isMinor = isMinorBirthDate(identity.birthDate);
  const onboarding = access.onboarding;
  const missing = findMissingPreRegistrationFields({
    name: identity.name || undefined,
    birthDate: identity.birthDate || undefined,
    phone: identity.phone || undefined,
    email: identity.email || undefined,
    privacyNoticeVersion: onboarding.privacyNoticeVersion || undefined,
    privacyAcceptedAt: onboarding.privacyAcceptedAt || undefined,
  });
  if (!identity.cpf) missing.push('cpf');
  if (isMinor) {
    if (!identity.guardianName) missing.push('guardianName');
    if (!identity.guardianCpf) missing.push('guardianCpf');
    if (authorization.status !== 'ACTIVE') missing.push('guardianAuthorization');
    if (access.accessRole === 'GUARDIAN' && !authorization.relationship) {
      missing.push('guardianRelationship');
    }
  }

  const nextSteps: PreRegistrationSessionDTO['nextSteps'] = [
    {
      key: 'ANAMNESIS',
      title: 'Responder Anamnese Inicial',
      description: 'Conte informações importantes para orientar seu acompanhamento.',
      optional: true,
      status: onboarding.healthModuleStatus,
      action:
        onboarding.healthModuleStatus === 'COMPLETED'
          ? 'VIEW'
          : onboarding.healthModuleStatus === 'IN_PROGRESS'
            ? 'CONTINUE'
            : 'START',
      href: '/pre-cadastro/anamnese',
    },
    {
      key: 'PARQ',
      title: 'Responder PAR-Q',
      description: 'Responda o questionário de prontidão para atividade física.',
      optional: true,
      status: onboarding.parqModuleStatus,
      action:
        onboarding.parqModuleStatus === 'COMPLETED'
          ? 'VIEW'
          : onboarding.parqModuleStatus === 'IN_PROGRESS'
            ? 'CONTINUE'
            : 'START',
      href: '/pre-cadastro/par-q',
    },
  ];

  return {
    alunoId: access.alunoId,
    status: access.status,
    version: onboarding.version,
    currentStep: onboarding.currentStep as PreRegistrationStep,
    lastSavedAt: onboarding.lastSavedAt?.toISOString(),
    completedAt: onboarding.completedAt?.toISOString(),
    tenant,
    identity: identity as PreRegistrationSessionDTO['identity'],
    isMinor,
    claimRole: access.accessRole,
    guardianAuthorization: authorization,
    privacy: {
      noticeVersion: PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
      noticeUrl: tenant.privacyNoticeUrl,
      acceptedAt: onboarding.privacyAcceptedAt?.toISOString(),
    },
    missingRequiredFields: Array.from(new Set(missing)),
    duplicateWarnings: warnings,
    nextSteps,
  };
}

async function startStudentPreRegistrationInTransaction(
  tx: Prisma.TransactionClient,
  access: LockedPreRegistrationAccess,
  userId: string
): Promise<void> {
  assertValidStudentLifecycleTransition(access.status, 'PRE_REGISTRATION_IN_PROGRESS');
  const changed = await tx.aluno.updateMany({
    where: {
      id: access.alunoId,
      contractId: access.contractId,
      status: 'INVITED',
      userId,
    },
    data: { status: 'PRE_REGISTRATION_IN_PROGRESS' },
  });
  if (changed.count !== 1) {
    throw new StudentLifecycleError(
      'O cadastro foi alterado por outra operação.',
      'CONCURRENT_MODIFICATION'
    );
  }
  const onboarding = await tx.studentOnboardingProcess.updateMany({
    where: {
      alunoId: access.alunoId,
      contractId: access.contractId,
      claimedByUserId: userId,
      claimRole: 'STUDENT',
    },
    data: { startedAt: new Date() },
  });
  if (onboarding.count !== 1) {
    throw new StudentLifecycleError('Processo de pré-matrícula não encontrado.', 'NOT_FOUND');
  }
  await tx.studentLifecycleEvent.create({
    data: {
      alunoId: access.alunoId,
      contractId: access.contractId,
      eventType: 'STATUS_CHANGED',
      actorUserId: userId,
      metadata: {
        from: 'INVITED',
        to: 'PRE_REGISTRATION_IN_PROGRESS',
        source: 'student_first_authenticated_save',
      },
    },
  });
}

export async function startAuthorizedPreRegistrationInTransaction(
  tx: Prisma.TransactionClient,
  access: LockedPreRegistrationAccess,
  userId: string
): Promise<LockedPreRegistrationAccess> {
  if (access.status !== 'INVITED') return access;
  if (access.accessRole === 'STUDENT') {
    await startStudentPreRegistrationInTransaction(tx, access, userId);
  } else {
    await startGuardianPreRegistrationInTransaction(
      tx,
      access.alunoId,
      access.contractId,
      userId
    );
  }
  return { ...access, status: 'PRE_REGISTRATION_IN_PROGRESS' };
}

async function resolveDescriptor(
  userId: string,
  alunoId: string
): Promise<Pick<LockedPreRegistrationAccess, 'contractId' | 'accessRole'>> {
  return prisma.$transaction(async (tx) => {
    const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
    return { contractId: access.contractId, accessRole: access.accessRole };
  });
}

export const preRegistrationPublicAtomicService = {
  async getSession(userId: string, alunoId: string): Promise<PreRegistrationSessionDTO> {
    try {
      return await prisma.$transaction((tx) => buildSessionInTransaction(tx, userId, alunoId));
    } catch (error) {
      mapLifecycleError(error);
    }
  },

  async saveStep(
    userId: string,
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<PreRegistrationSessionDTO> {
    try {
      return await prisma.$transaction(async (tx) => {
        let access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
        if (access.status === 'PRE_REGISTRATION_COMPLETED') {
          throw new PreRegistrationPublicError(
            'O pré-cadastro já foi concluído.',
            'PRE_REGISTRATION_COMPLETED'
          );
        }
        if (access.onboarding.version !== input.expectedVersion) {
          throw new PreRegistrationPublicError(
            'Os dados foram alterados em outro local. Recarregue antes de salvar novamente.',
            'CONCURRENT_MODIFICATION',
            { currentVersion: access.onboarding.version }
          );
        }

        access = await startAuthorizedPreRegistrationInTransaction(tx, access, userId);

        if (input.step === 'IDENTIFICATION' || input.step === 'CONTACT') {
          await lockStudentIdentityDeduplicationScope(tx, access.contractId);
          const detection = await detectPreRegistrationDuplicates(tx, {
            contractId: access.contractId,
            alunoId: access.alunoId,
            overrides: input.data,
          });
          if (
            detection.classification === 'BLOCKING' ||
            detection.classification === 'REVIEW_REQUIRED'
          ) {
            throw new PreRegistrationPublicError(
              'Seus dados precisam de revisão pela academia antes de continuar.',
              'DUPLICATE_REVIEW_REQUIRED',
              { reviewRequired: true }
            );
          }
        }

        const identity = await upsertStudentIdentity(
          access.alunoId,
          access.contractId,
          input.data,
          {
            client: tx,
            actor: { userId },
            sourceType: 'student',
            sourceReference: 'public_pre_registration',
            syncLegacyProfile: access.accessRole === 'STUDENT',
          }
        );

        const stillAuthorized = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
        if (stillAuthorized.onboarding.version !== input.expectedVersion) {
          throw new PreRegistrationPublicError(
            'Os dados foram alterados em outro local. Recarregue antes de salvar novamente.',
            'CONCURRENT_MODIFICATION',
            { currentVersion: stillAuthorized.onboarding.version }
          );
        }

        const nextStep = nextStepAfter(input.step, identity, stillAuthorized.accessRole);
        const updated = await tx.$executeRaw`
          UPDATE "StudentOnboardingProcess"
          SET "version" = "version" + 1,
              "currentStep" = ${nextStep},
              "lastSavedAt" = CURRENT_TIMESTAMP,
              "formVersion" = ${FORM_VERSION},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "alunoId" = ${stillAuthorized.alunoId}
            AND "contractId" = ${stillAuthorized.contractId}
            AND "claimedByUserId" = ${userId}
            AND "claimRole" = ${stillAuthorized.accessRole}
            AND "version" = ${input.expectedVersion}
        `;
        if (updated !== 1) {
          throw new PreRegistrationPublicError(
            'Os dados foram alterados em outro local. Recarregue antes de salvar novamente.',
            'CONCURRENT_MODIFICATION'
          );
        }

        return buildSessionInTransaction(tx, userId, alunoId);
      });
    } catch (error) {
      mapLifecycleError(error);
    }
  },

  async complete(
    userId: string,
    alunoId: string,
    input: CompletePreRegistrationDTO,
    audit: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<PreRegistrationSessionDTO> {
    if (input.privacyAccepted !== true) {
      throw new PreRegistrationPublicError(
        'Confirme o aviso de privacidade para concluir.',
        'MISSING_REQUIRED_FIELDS',
        { fields: ['privacyAccepted'] }
      );
    }
    try {
      const descriptor = await resolveDescriptor(userId, alunoId);
      await completePublicStudentPreRegistration({
        alunoId,
        contractId: descriptor.contractId,
        actorUserId: userId,
        accessRole: descriptor.accessRole,
        expectedVersion: input.expectedVersion,
        privacyNoticeVersion: PRE_REGISTRATION_PRIVACY_NOTICE_VERSION,
        privacyAcceptedAt: new Date(),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
      return await prisma.$transaction((tx) => buildSessionInTransaction(tx, userId, alunoId));
    } catch (error) {
      mapLifecycleError(error);
    }
  },
};
