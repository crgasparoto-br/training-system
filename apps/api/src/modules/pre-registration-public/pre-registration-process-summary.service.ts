import { PrismaClient } from '@prisma/client';
import type {
  PreRegistrationClaimRole,
  PreRegistrationProcessSummaryDTO,
  PreRegistrationPublicTenantDTO,
  PreRegistrationStep,
  StudentLifecycleStatus,
} from '@corrida/types';
import { preRegistrationPublicService } from './pre-registration-public.service.js';

const prisma = new PrismaClient();

type TerminalProcessAccessRow = {
  alunoId: string;
  status: StudentLifecycleStatus;
  claimRole: PreRegistrationClaimRole;
  currentStep: string;
  lastSavedAt: Date | null;
  authorizationStatus: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'NOT_REQUIRED';
  authorizationRelationship: string | null;
  authorizationUpdatedAt: Date | null;
  displayName: string | null;
  contractName: string | null;
  contractTradeName: string | null;
  contractLogoUrl: string | null;
};

function privacyNoticeUrl(): string {
  const configured = process.env.PRIVACY_NOTICE_URL?.trim();
  if (configured) return configured;
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${frontend}/privacidade`;
}

function processSummary(row: TerminalProcessAccessRow): PreRegistrationProcessSummaryDTO {
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
    guardianAuthorizationRelationship: row.authorizationRelationship || undefined,
    guardianAuthorizationRequestedAt: row.authorizationUpdatedAt?.toISOString(),
    requiresGuardianConfirmation:
      row.claimRole === 'GUARDIAN' && row.authorizationStatus !== 'ACTIVE',
  };
}

async function listTerminalProcesses(userId: string): Promise<PreRegistrationProcessSummaryDTO[]> {
  const directRows = await prisma.$queryRaw<TerminalProcessAccessRow[]>`
    SELECT student."id" AS "alunoId", student."status",
           'STUDENT'::text AS "claimRole", onboarding."currentStep",
           onboarding."lastSavedAt", 'NOT_REQUIRED'::text AS "authorizationStatus",
           NULL::text AS "authorizationRelationship",
           NULL::timestamp AS "authorizationUpdatedAt",
           COALESCE(profile."identificationData"->>'name', student."leadName") AS "displayName",
           contract."name" AS "contractName", contract."tradeName" AS "contractTradeName",
           contract."logoUrl" AS "contractLogoUrl"
    FROM "Aluno" AS student
    JOIN "StudentOnboardingProcess" AS onboarding ON onboarding."alunoId" = student."id"
    JOIN "Contract" AS contract ON contract."id" = student."contractId"
    LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
    WHERE student."userId" = ${userId}
      AND onboarding."claimedByUserId" = ${userId}
      AND student."status" IN ('ACTIVE_STUDENT', 'DISCARDED')
  `;

  const guardianRows = await prisma.$queryRaw<TerminalProcessAccessRow[]>`
    SELECT student."id" AS "alunoId", student."status",
           'GUARDIAN'::text AS "claimRole", onboarding."currentStep",
           onboarding."lastSavedAt", auth."status" AS "authorizationStatus",
           auth."relationship" AS "authorizationRelationship",
           auth."updatedAt" AS "authorizationUpdatedAt",
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
      AND student."status" IN ('ACTIVE_STUDENT', 'DISCARDED')
  `;

  return [...directRows, ...guardianRows].map(processSummary);
}

export const preRegistrationProcessSummaryService = {
  async listProcesses(userId: string): Promise<PreRegistrationProcessSummaryDTO[]> {
    const actionable = await preRegistrationPublicService.listProcesses(userId);
    const terminal = await listTerminalProcesses(userId);
    const unique = new Map<string, PreRegistrationProcessSummaryDTO>();

    for (const process of [...actionable, ...terminal]) {
      unique.set(process.alunoId, process);
    }

    return Array.from(unique.values()).sort((left, right) =>
      (right.lastSavedAt || '').localeCompare(left.lastSavedAt || '')
    );
  },
};
