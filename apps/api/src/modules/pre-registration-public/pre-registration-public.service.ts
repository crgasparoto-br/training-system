import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AuthResponse,
  CompletePreRegistrationDTO,
  ConfirmGuardianAuthorizationDTO,
  PreRegistrationAccountRegistrationDTO,
  PreRegistrationClaimDTO,
  PreRegistrationClaimResultDTO,
  PreRegistrationClaimRole,
  PreRegistrationGuardianAuthorizationDTO,
  PreRegistrationProcessSummaryDTO,
  PreRegistrationPublicErrorCode,
  PreRegistrationPublicTenantDTO,
  PreRegistrationSessionDTO,
  PreRegistrationStep,
  SavePreRegistrationStepDTO,
  StudentLifecycleStatus,
} from '@corrida/types';
import { authService } from '../auth/auth.service.js';
import {
  findMissingPreRegistrationFields,
  startStudentPreRegistration,
  StudentLifecycleError,
} from '../alunos/student-lifecycle.service.js';
import {
  completePublicStudentPreRegistration,
  startGuardianPreRegistrationInTransaction,
} from '../alunos/student-public-pre-registration.service.js';
import {
  findStudentAccountIdentityMismatches,
  loadStudentIdentity,
  normalizeStudentEmail,
  upsertStudentIdentity,
} from '../alunos/student-identity.service.js';
import {
  hashInviteToken,
  timingSafeEqualHash,
} from '../pre-registration-invites/pre-registration-invite-token.js';

const prisma = new PrismaClient();
const PRIVACY_NOTICE_VERSION = process.env.PRIVACY_NOTICE_VERSION?.trim() || '2026-07';
const FORM_VERSION = 'pre-registration-v1';

const ALLOWED_PRE_REGISTRATION_STATUSES: StudentLifecycleStatus[] = [
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
  'PRE_REGISTRATION_COMPLETED',
];

export class PreRegistrationPublicError extends Error {
  constructor(
    message: string,
    public readonly code: PreRegistrationPublicErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreRegistrationPublicError';
  }
}

type InviteRow = {
  id: string;
  alunoId: string;
  contractId: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
};

type OnboardingRow = {
  version: number;
  currentStep: string;
  claimRole: string;
  claimedByUserId: string | null;
  lastSavedAt: Date | null;
  completedAt: Date | null;
  privacyNoticeVersion: string | null;
  privacyAcceptedAt: Date | null;
  healthModuleStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  parqModuleStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
};

type GuardianAuthorizationRow = {
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  relationship: string | null;
  validatedAt: Date | null;
  revokedAt: Date | null;
};

type AccessibleAluno = {
  id: string;
  contractId: string;
  status: StudentLifecycleStatus;
  accessRole: PreRegistrationClaimRole;
  authorizationStatus?: GuardianAuthorizationRow['status'];
};

type ProcessAccessRow = {
  alunoId: string;
  contractId: string;
  status: StudentLifecycleStatus;
  claimRole: PreRegistrationClaimRole;
  currentStep: string;
  lastSavedAt: Date | null;
  authorizationStatus: GuardianAuthorizationRow['status'] | 'NOT_REQUIRED';
  displayName: string | null;
  contractName: string | null;
  contractTradeName: string | null;
  contractLogoUrl: string | null;
};

const normalizeText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

function assertClaimRole(role: unknown): asserts role is PreRegistrationClaimRole {
  if (role !== 'STUDENT' && role !== 'GUARDIAN') {
    throw new PreRegistrationPublicError('Perfil de acesso inválido.', 'ACCOUNT_INCOMPATIBLE');
  }
}

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
  let age = now.getFullYear() - birthDate.getFullYear();
  const month = now.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birthDate.getDate())) age -= 1;
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

async function resolveInviteForClaim(
  tx: Prisma.TransactionClient,
  token: string,
  now = new Date()
): Promise<InviteRow> {
  if (!token || token.length > 512) {
    throw new PreRegistrationPublicError('Link inválido ou expirado.', 'INVALID_INVITE');
  }
  const tokenHash = hashInviteToken(token);
  const rows = await tx.$queryRaw<InviteRow[]>`
    SELECT "id", "alunoId", "contractId", "tokenHash", "status", "expiresAt"
    FROM "PreRegistrationInvite"
    WHERE "tokenHash" = ${tokenHash}
    FOR UPDATE
  `;
  const invite = rows[0];
  if (
    !invite ||
    !timingSafeEqualHash(invite.tokenHash, tokenHash) ||
    invite.status !== 'ACTIVE' ||
    invite.expiresAt <= now
  ) {
    throw new PreRegistrationPublicError('Link inválido ou expirado.', 'INVALID_INVITE');
  }
  return invite;
}

async function accountIdentityMismatches(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  userId: string,
  accountEmail: string
): Promise<string[]> {
  const [identity, baseMismatches] = await Promise.all([
    loadStudentIdentity(alunoId, contractId, tx),
    findStudentAccountIdentityMismatches(alunoId, contractId, userId, tx),
  ]);
  const mismatches = new Set(baseMismatches);
  if (
    identity.email &&
    normalizeStudentEmail(identity.email) !== normalizeStudentEmail(accountEmail)
  ) {
    mismatches.add('email');
  }
  return Array.from(mismatches);
}

async function claimInviteInTransaction(
  tx: Prisma.TransactionClient,
  invite: InviteRow,
  userId: string,
  role: PreRegistrationClaimRole
): Promise<string> {
  const user = await tx.user.findFirst({
    where: { id: userId, isActive: true, type: 'aluno' },
    include: { profile: true },
  });
  if (!user) {
    throw new PreRegistrationPublicError(
      'Use uma conta de aluno válida para continuar.',
      'ACCOUNT_INCOMPATIBLE'
    );
  }

  const aluno = await tx.aluno.findFirst({
    where: { id: invite.alunoId, contractId: invite.contractId },
    include: { onboarding: true },
  });
  if (!aluno || !aluno.onboarding) {
    throw new PreRegistrationPublicError('Cadastro não disponível.', 'NOT_FOUND');
  }
  if (!ALLOWED_PRE_REGISTRATION_STATUSES.includes(aluno.status)) {
    if (role === 'STUDENT' && aluno.status === 'ACTIVE_STUDENT' && aluno.userId === userId) {
      throw new PreRegistrationPublicError(
        'Sua conta já está vinculada a um cadastro ativo nesta academia.',
        'ACTIVE_STUDENT',
        { redirectTo: '/inicio' }
      );
    }
    throw new PreRegistrationPublicError('Cadastro não disponível.', 'NOT_FOUND');
  }
  if (aluno.onboarding.claimedByUserId && aluno.onboarding.claimedByUserId !== userId) {
    throw new PreRegistrationPublicError(
      'Este convite já foi vinculado a outra conta. Solicite um novo acesso à academia.',
      'ACCOUNT_ALREADY_LINKED'
    );
  }
  if (
    aluno.onboarding.claimedByUserId === userId &&
    aluno.onboarding.claimRole !== role
  ) {
    throw new PreRegistrationPublicError(
      'Este processo já foi vinculado com outro perfil de acesso.',
      'ACCOUNT_INCOMPATIBLE'
    );
  }

  const wasAlreadyClaimed = aluno.onboarding.claimedByUserId === userId;

  if (role === 'STUDENT') {
    if (aluno.userId && aluno.userId !== userId) {
      throw new PreRegistrationPublicError(
        'Este convite já foi vinculado a outra conta. Solicite um novo acesso à academia.',
        'ACCOUNT_ALREADY_LINKED'
      );
    }

    const existing = await tx.aluno.findFirst({
      where: { contractId: invite.contractId, userId, id: { not: invite.alunoId } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'ACTIVE_STUDENT') {
      throw new PreRegistrationPublicError(
        'Sua conta já está vinculada a um cadastro ativo nesta academia.',
        'ACTIVE_STUDENT',
        { redirectTo: '/inicio' }
      );
    }
    if (existing) {
      throw new PreRegistrationPublicError(
        'Esta conta já está vinculada a outro cadastro nesta academia.',
        'ACCOUNT_INCOMPATIBLE'
      );
    }

    if (!aluno.userId) {
      const mismatches = await accountIdentityMismatches(
        tx,
        invite.alunoId,
        invite.contractId,
        userId,
        user.email
      );
      if (mismatches.length > 0) {
        throw new PreRegistrationPublicError(
          'Os dados da conta não correspondem ao convite. Entre em contato com a academia.',
          'ACCOUNT_INCOMPATIBLE',
          { fields: mismatches }
        );
      }

      const linked = await tx.aluno.updateMany({
        where: { id: invite.alunoId, contractId: invite.contractId, userId: null },
        data: { userId },
      });
      if (linked.count !== 1) {
        throw new PreRegistrationPublicError(
          'Este convite já foi vinculado a outra conta.',
          'ACCOUNT_ALREADY_LINKED'
        );
      }
    }
  } else {
    if (aluno.userId === userId) {
      throw new PreRegistrationPublicError(
        'Use o acesso do próprio aluno para este cadastro.',
        'ACCOUNT_INCOMPATIBLE'
      );
    }
    const identity = await loadStudentIdentity(invite.alunoId, invite.contractId, tx);
    if (!identity.birthDate || !isMinorBirthDate(identity.birthDate)) {
      throw new PreRegistrationPublicError(
        'O acesso como responsável legal está disponível somente para cadastro de menor de idade confirmado pela academia.',
        'ACCOUNT_INCOMPATIBLE'
      );
    }

    const currentAuthorization = await tx.$queryRaw<GuardianAuthorizationRow[]>`
      SELECT "status", "relationship", "validatedAt", "revokedAt"
      FROM "PreRegistrationGuardianAuthorization"
      WHERE "alunoId" = ${invite.alunoId}
        AND "contractId" = ${invite.contractId}
        AND "guardianUserId" = ${userId}
        AND "purpose" = 'PRE_REGISTRATION'
      LIMIT 1
    `;
    if (currentAuthorization[0]?.status !== 'ACTIVE') {
      await tx.$executeRaw`
        INSERT INTO "PreRegistrationGuardianAuthorization" (
          "id", "contractId", "alunoId", "guardianUserId", "purpose", "status",
          "createdAt", "updatedAt"
        ) VALUES (
          ${crypto.randomUUID()}, ${invite.contractId}, ${invite.alunoId}, ${userId},
          'PRE_REGISTRATION', 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("alunoId", "guardianUserId", "purpose")
        DO UPDATE SET
          "status" = 'PENDING',
          "relationship" = NULL,
          "validatedAt" = NULL,
          "validatedByUserId" = NULL,
          "revokedAt" = NULL,
          "revokedByUserId" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      `;
    }
  }

  const updated = await tx.$executeRaw`
    UPDATE "StudentOnboardingProcess"
    SET "claimedByUserId" = ${userId},
        "claimedAt" = COALESCE("claimedAt", CURRENT_TIMESTAMP),
        "claimRole" = ${role},
        "formVersion" = COALESCE("formVersion", ${FORM_VERSION}),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "alunoId" = ${invite.alunoId}
      AND "contractId" = ${invite.contractId}
      AND ("claimedByUserId" IS NULL OR "claimedByUserId" = ${userId})
  `;
  if (updated !== 1) {
    throw new PreRegistrationPublicError(
      'Este convite já foi vinculado a outra conta.',
      'ACCOUNT_ALREADY_LINKED'
    );
  }

  if (!wasAlreadyClaimed) {
    await tx.studentLifecycleEvent.create({
      data: {
        alunoId: invite.alunoId,
        contractId: invite.contractId,
        eventType: 'ACCOUNT_LINKED',
        actorUserId: userId,
        metadata: {
          source: 'public_pre_registration',
          role,
          guardianAuthorizationStatus: role === 'GUARDIAN' ? 'PENDING' : undefined,
        },
      },
    });
  }

  return invite.alunoId;
}

async function findAccessibleAluno(
  userId: string,
  alunoId: string,
  options: { allowPendingGuardian?: boolean } = {}
): Promise<AccessibleAluno> {
  const direct = await prisma.aluno.findFirst({
    where: {
      id: alunoId,
      userId,
      status: { in: ALLOWED_PRE_REGISTRATION_STATUSES },
      onboarding: { claimedByUserId: userId },
    },
    select: { id: true, contractId: true, status: true },
  });
  if (direct) return { ...direct, accessRole: 'STUDENT' };

  const allowedAuthorizationStatuses = options.allowPendingGuardian
    ? Prisma.sql`('PENDING', 'ACTIVE')`
    : Prisma.sql`('ACTIVE')`;
  const guardianRows = await prisma.$queryRaw<
    Array<{
      alunoId: string;
      contractId: string;
      status: StudentLifecycleStatus;
      authorizationStatus: GuardianAuthorizationRow['status'];
    }>
  >`
    SELECT auth."alunoId", auth."contractId", student."status",
           auth."status" AS "authorizationStatus"
    FROM "PreRegistrationGuardianAuthorization" AS auth
    JOIN "Aluno" AS student ON student."id" = auth."alunoId"
    JOIN "StudentOnboardingProcess" AS onboarding ON onboarding."alunoId" = student."id"
    WHERE auth."guardianUserId" = ${userId}
      AND auth."alunoId" = ${alunoId}
      AND auth."purpose" = 'PRE_REGISTRATION'
      AND auth."status" IN ${allowedAuthorizationStatuses}
      AND onboarding."claimedByUserId" = ${userId}
      AND student."status" IN ('INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
    LIMIT 1
  `;
  const guardian = guardianRows[0];
  if (!guardian) throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
  if (guardian.authorizationStatus !== 'ACTIVE' && !options.allowPendingGuardian) {
    throw new PreRegistrationPublicError(
      'Confirme o vínculo com o menor antes de acessar os dados pessoais.',
      'GUARDIAN_AUTHORIZATION_REQUIRED'
    );
  }
  return {
    id: guardian.alunoId,
    contractId: guardian.contractId,
    status: guardian.status,
    accessRole: 'GUARDIAN',
    authorizationStatus: guardian.authorizationStatus,
  };
}

async function onboardingRow(alunoId: string, contractId: string): Promise<OnboardingRow> {
  const rows = await prisma.$queryRaw<OnboardingRow[]>`
    SELECT "version", "currentStep", "claimRole", "claimedByUserId", "lastSavedAt", "completedAt",
           "privacyNoticeVersion", "privacyAcceptedAt", "healthModuleStatus", "parqModuleStatus"
    FROM "StudentOnboardingProcess"
    WHERE "alunoId" = ${alunoId} AND "contractId" = ${contractId}
  `;
  if (!rows[0]) throw new PreRegistrationPublicError('Processo não encontrado.', 'NOT_FOUND');
  return rows[0];
}

async function tenantView(contractId: string): Promise<PreRegistrationPublicTenantDTO> {
  const contract = await prisma.companyContract.findUnique({
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

async function duplicateWarnings(alunoId: string, contractId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: { leadEmailNormalized: true, leadPhoneNormalized: true },
  });
  if (!aluno) return [] as Array<'email' | 'phone'>;
  const warnings: Array<'email' | 'phone'> = [];
  if (
    aluno.leadEmailNormalized &&
    (await prisma.aluno.count({
      where: {
        contractId,
        id: { not: alunoId },
        leadEmailNormalized: aluno.leadEmailNormalized,
        status: { not: 'DISCARDED' },
      },
    })) > 0
  ) warnings.push('email');
  if (
    aluno.leadPhoneNormalized &&
    (await prisma.aluno.count({
      where: {
        contractId,
        id: { not: alunoId },
        leadPhoneNormalized: aluno.leadPhoneNormalized,
        status: { not: 'DISCARDED' },
      },
    })) > 0
  ) warnings.push('phone');
  return warnings;
}

async function guardianAuthorization(
  alunoId: string,
  contractId: string,
  userId: string,
  isMinor: boolean,
  role: PreRegistrationClaimRole
): Promise<PreRegistrationGuardianAuthorizationDTO> {
  if (!isMinor && role !== 'GUARDIAN') return { status: 'NOT_REQUIRED', role };

  const rows = role === 'GUARDIAN'
    ? await prisma.$queryRaw<GuardianAuthorizationRow[]>`
        SELECT "status", "relationship", "validatedAt", "revokedAt"
        FROM "PreRegistrationGuardianAuthorization"
        WHERE "alunoId" = ${alunoId}
          AND "contractId" = ${contractId}
          AND "guardianUserId" = ${userId}
          AND "purpose" = 'PRE_REGISTRATION'
        LIMIT 1
      `
    : await prisma.$queryRaw<GuardianAuthorizationRow[]>`
        SELECT "status", NULL::text AS "relationship", "validatedAt", "revokedAt"
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

async function buildSession(userId: string, alunoId: string): Promise<PreRegistrationSessionDTO> {
  const aluno = await findAccessibleAluno(userId, alunoId);
  const [identity, onboarding, tenant, warnings] = await Promise.all([
    loadStudentIdentity(aluno.id, aluno.contractId),
    onboardingRow(aluno.id, aluno.contractId),
    tenantView(aluno.contractId),
    duplicateWarnings(aluno.id, aluno.contractId),
  ]);
  const isMinor = isMinorBirthDate(identity.birthDate);
  const role = aluno.accessRole;
  const authorization = await guardianAuthorization(
    aluno.id,
    aluno.contractId,
    userId,
    isMinor,
    role
  );
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
    if (role === 'GUARDIAN' && !authorization.relationship) missing.push('guardianRelationship');
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
    alunoId: aluno.id,
    status: aluno.status,
    version: onboarding.version,
    currentStep: onboarding.currentStep as PreRegistrationStep,
    lastSavedAt: onboarding.lastSavedAt?.toISOString(),
    completedAt: onboarding.completedAt?.toISOString(),
    tenant,
    identity: identity as PreRegistrationSessionDTO['identity'],
    isMinor,
    claimRole: role,
    guardianAuthorization: authorization,
    privacy: {
      noticeVersion: PRIVACY_NOTICE_VERSION,
      noticeUrl: tenant.privacyNoticeUrl,
      acceptedAt: onboarding.privacyAcceptedAt?.toISOString(),
    },
    missingRequiredFields: Array.from(new Set(missing)),
    duplicateWarnings: warnings,
    nextSteps,
  };
}

function processSummary(row: ProcessAccessRow): PreRegistrationProcessSummaryDTO {
  const tenant: PreRegistrationPublicTenantDTO = {
    name: row.contractTradeName || row.contractName || 'Academia',
    logoUrl: row.contractLogoUrl || undefined,
    privacyNoticeUrl: privacyNoticeUrl(),
  };
  return {
    alunoId: row.alunoId,
    status: row.status,
    claimRole: row.claimRole,
    currentStep: row.currentStep as PreRegistrationStep,
    lastSavedAt: row.lastSavedAt?.toISOString(),
    displayName:
      row.claimRole === 'GUARDIAN' && row.authorizationStatus !== 'ACTIVE'
        ? 'Dependente convidado'
        : row.displayName || (row.claimRole === 'STUDENT' ? 'Seu cadastro' : 'Dependente'),
    tenant,
    guardianAuthorizationStatus: row.authorizationStatus,
    requiresGuardianConfirmation:
      row.claimRole === 'GUARDIAN' && row.authorizationStatus !== 'ACTIVE',
  };
}

async function listProcesses(userId: string): Promise<PreRegistrationProcessSummaryDTO[]> {
  const directRows = await prisma.$queryRaw<ProcessAccessRow[]>`
    SELECT student."id" AS "alunoId", student."contractId", student."status",
           'STUDENT'::text AS "claimRole", onboarding."currentStep",
           onboarding."lastSavedAt", 'NOT_REQUIRED'::text AS "authorizationStatus",
           COALESCE(profile."identificationData"->>'name', student."leadName") AS "displayName",
           contract."name" AS "contractName", contract."tradeName" AS "contractTradeName",
           contract."logoUrl" AS "contractLogoUrl"
    FROM "Aluno" AS student
    JOIN "StudentOnboardingProcess" AS onboarding ON onboarding."alunoId" = student."id"
    JOIN "Contract" AS contract ON contract."id" = student."contractId"
    LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
    WHERE student."userId" = ${userId}
      AND onboarding."claimedByUserId" = ${userId}
      AND student."status" IN ('INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
  `;
  const guardianRows = await prisma.$queryRaw<ProcessAccessRow[]>`
    SELECT student."id" AS "alunoId", student."contractId", student."status",
           'GUARDIAN'::text AS "claimRole", onboarding."currentStep",
           onboarding."lastSavedAt", auth."status" AS "authorizationStatus",
           CASE WHEN auth."status" = 'ACTIVE'
             THEN COALESCE(profile."identificationData"->>'name', student."leadName")
             ELSE NULL
           END AS "displayName",
           contract."name" AS "contractName", contract."tradeName" AS "contractTradeName",
           contract."logoUrl" AS "contractLogoUrl"
    FROM "PreRegistrationGuardianAuthorization" AS auth
    JOIN "Aluno" AS student ON student."id" = auth."alunoId"
    JOIN "StudentOnboardingProcess" AS onboarding ON onboarding."alunoId" = student."id"
    JOIN "Contract" AS contract ON contract."id" = student."contractId"
    LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
    WHERE auth."guardianUserId" = ${userId}
      AND auth."purpose" = 'PRE_REGISTRATION'
      AND auth."status" IN ('PENDING', 'ACTIVE')
      AND onboarding."claimedByUserId" = ${userId}
      AND student."status" IN ('INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED')
  `;

  const unique = new Map<string, PreRegistrationProcessSummaryDTO>();
  for (const row of [...directRows, ...guardianRows]) {
    unique.set(row.alunoId, processSummary(row));
  }
  return Array.from(unique.values()).sort((left, right) =>
    (right.lastSavedAt || '').localeCompare(left.lastSavedAt || '')
  );
}

function mapLifecycleError(error: unknown): never {
  if (error instanceof PreRegistrationPublicError) throw error;
  if (error instanceof StudentLifecycleError) {
    const fields = Array.isArray(error.details?.fields) ? error.details?.fields : [];
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

export const preRegistrationPublicService = {
  async registerAndClaim(
    token: string,
    input: PreRegistrationAccountRegistrationDTO
  ): Promise<AuthResponse & PreRegistrationClaimResultDTO> {
    assertClaimRole(input.role);
    const email = normalizeStudentEmail(input.email);
    const name = normalizeText(input.name);
    if (!email || !name || typeof input.password !== 'string' || input.password.length < 8) {
      throw new PreRegistrationPublicError(
        'Informe nome, e-mail válido e uma senha com pelo menos 8 caracteres.',
        'MISSING_REQUIRED_FIELDS'
      );
    }

    let alunoId = '';
    try {
      alunoId = await prisma.$transaction(async (tx) => {
        const invite = await resolveInviteForClaim(tx, token);
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          throw new PreRegistrationPublicError(
            'Já existe uma conta com este e-mail. Entre com sua senha para continuar.',
            'ACCOUNT_EXISTS'
          );
        }
        const passwordHash = await bcryptjs.hash(input.password, 10);
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            type: 'aluno',
            profile: { create: { name } },
          },
        });
        return claimInviteInTransaction(tx, invite, user.id, input.role);
      });
    } catch (error) {
      mapLifecycleError(error);
    }

    const auth = await authService.login({ email, password: input.password });
    return { ...auth, alunoId, redirectTo: '/pre-cadastro' };
  },

  async claim(userId: string, input: PreRegistrationClaimDTO): Promise<PreRegistrationClaimResultDTO> {
    assertClaimRole(input.role);
    try {
      const alunoId = await prisma.$transaction(async (tx) => {
        const invite = await resolveInviteForClaim(tx, input.token);
        return claimInviteInTransaction(tx, invite, userId, input.role);
      });
      return { alunoId, redirectTo: '/pre-cadastro' };
    } catch (error) {
      mapLifecycleError(error);
    }
  },

  async listProcesses(userId: string) {
    return listProcesses(userId);
  },

  async confirmGuardianAuthorization(
    userId: string,
    alunoId: string,
    input: ConfirmGuardianAuthorizationDTO
  ) {
    const relationship = normalizeText(input.relationship);
    if (input.declarationAccepted !== true || !relationship) {
      throw new PreRegistrationPublicError(
        'Confirme a declaração e informe o vínculo com o menor.',
        'GUARDIAN_AUTHORIZATION_REQUIRED'
      );
    }
    const accessible = await findAccessibleAluno(userId, alunoId, { allowPendingGuardian: true });
    if (accessible.accessRole !== 'GUARDIAN') {
      throw new PreRegistrationPublicError(
        'Este cadastro não utiliza acesso de responsável legal.',
        'ACCOUNT_INCOMPATIBLE'
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const identity = await loadStudentIdentity(alunoId, accessible.contractId, tx);
        if (!identity.birthDate || !isMinorBirthDate(identity.birthDate)) {
          throw new PreRegistrationPublicError(
            'A academia precisa confirmar a menoridade antes de liberar este acesso.',
            'GUARDIAN_AUTHORIZATION_REQUIRED'
          );
        }
        const updated = await tx.$executeRaw`
          UPDATE "PreRegistrationGuardianAuthorization"
          SET "relationship" = ${relationship},
              "status" = 'ACTIVE',
              "validatedAt" = CURRENT_TIMESTAMP,
              "validatedByUserId" = ${userId},
              "revokedAt" = NULL,
              "revokedByUserId" = NULL,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "alunoId" = ${alunoId}
            AND "contractId" = ${accessible.contractId}
            AND "guardianUserId" = ${userId}
            AND "purpose" = 'PRE_REGISTRATION'
            AND "status" IN ('PENDING', 'ACTIVE')
        `;
        if (updated !== 1) {
          throw new PreRegistrationPublicError(
            'O vínculo não está disponível para confirmação.',
            'GUARDIAN_AUTHORIZATION_REQUIRED'
          );
        }
        await tx.studentLifecycleEvent.create({
          data: {
            alunoId,
            contractId: accessible.contractId,
            eventType: 'ACCOUNT_LINKED',
            actorUserId: userId,
            metadata: {
              source: 'public_pre_registration',
              role: 'GUARDIAN',
              action: 'guardian_authorization_confirmed',
              relationship,
            },
          },
        });
      });
      return buildSession(userId, alunoId);
    } catch (error) {
      mapLifecycleError(error);
    }
  },

  async getSession(userId: string, alunoId: string) {
    return buildSession(userId, alunoId);
  },

  async saveStep(userId: string, alunoId: string, input: SavePreRegistrationStepDTO) {
    const aluno = await findAccessibleAluno(userId, alunoId);
    if (aluno.status === 'PRE_REGISTRATION_COMPLETED') {
      throw new PreRegistrationPublicError(
        'O pré-cadastro já foi concluído.',
        'PRE_REGISTRATION_COMPLETED'
      );
    }
    if (aluno.status === 'INVITED' && aluno.accessRole === 'STUDENT') {
      await startStudentPreRegistration(aluno.id, aluno.contractId, userId);
    }
    if (aluno.status === 'INVITED' && aluno.accessRole === 'GUARDIAN') {
      await prisma.$transaction((tx) =>
        startGuardianPreRegistrationInTransaction(tx, aluno.id, aluno.contractId, userId)
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<OnboardingRow[]>`
          SELECT "version", "currentStep", "claimRole", "claimedByUserId", "lastSavedAt", "completedAt",
                 "privacyNoticeVersion", "privacyAcceptedAt", "healthModuleStatus", "parqModuleStatus"
          FROM "StudentOnboardingProcess"
          WHERE "alunoId" = ${aluno.id} AND "contractId" = ${aluno.contractId}
          FOR UPDATE
        `;
        const current = rows[0];
        if (!current || current.version !== input.expectedVersion) {
          throw new PreRegistrationPublicError(
            'Os dados foram alterados em outro local. Recarregue antes de salvar novamente.',
            'CONCURRENT_MODIFICATION',
            { currentVersion: current?.version }
          );
        }

        const identity = await upsertStudentIdentity(
          aluno.id,
          aluno.contractId,
          input.data,
          {
            client: tx,
            actor: { userId },
            sourceType: 'student',
            sourceReference: 'public_pre_registration',
            syncLegacyProfile: aluno.accessRole === 'STUDENT',
          }
        );

        const nextStep = nextStepAfter(input.step, identity, aluno.accessRole);
        const updated = await tx.$executeRaw`
          UPDATE "StudentOnboardingProcess"
          SET "version" = "version" + 1,
              "currentStep" = ${nextStep},
              "lastSavedAt" = CURRENT_TIMESTAMP,
              "formVersion" = ${FORM_VERSION},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "alunoId" = ${aluno.id}
            AND "contractId" = ${aluno.contractId}
            AND "version" = ${input.expectedVersion}
        `;
        if (updated !== 1) {
          throw new PreRegistrationPublicError(
            'Os dados foram alterados em outro local. Recarregue antes de salvar novamente.',
            'CONCURRENT_MODIFICATION'
          );
        }
      });
    } catch (error) {
      mapLifecycleError(error);
    }

    return buildSession(userId, alunoId);
  },

  async complete(
    userId: string,
    alunoId: string,
    input: CompletePreRegistrationDTO,
    audit: { ipAddress?: string; userAgent?: string } = {}
  ) {
    const accessible = await findAccessibleAluno(userId, alunoId);
    if (input.privacyAccepted !== true) {
      throw new PreRegistrationPublicError(
        'Confirme o aviso de privacidade para concluir.',
        'MISSING_REQUIRED_FIELDS',
        { fields: ['privacyAccepted'] }
      );
    }

    try {
      await completePublicStudentPreRegistration({
        alunoId,
        contractId: accessible.contractId,
        actorUserId: userId,
        accessRole: accessible.accessRole,
        expectedVersion: input.expectedVersion,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        privacyAcceptedAt: new Date(),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    } catch (error) {
      mapLifecycleError(error);
    }

    return buildSession(userId, alunoId);
  },
};