import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CompleteHealthIntakeDTO,
  HealthIntakeAnswersDTO,
  HealthIntakeErrorCode,
  HealthIntakeSessionDTO,
  HealthIntakeStep,
  SaveHealthIntakeStepDTO,
} from '@corrida/types';
import {
  lockAndAuthorizePreRegistrationProcess,
  type LockedPreRegistrationAccess,
} from './pre-registration-public-atomic.service.js';

const prisma = new PrismaClient();
const HEALTH_FORM_VERSION = 'health-intake-v1';
const HEALTH_NOTICE_VERSION =
  process.env.HEALTH_PRIVACY_NOTICE_VERSION?.trim() ||
  process.env.PRIVACY_NOTICE_VERSION?.trim() ||
  '2026-07';

const STEP_ORDER: HealthIntakeStep[] = [
  'CONSENT',
  'HEALTH_HISTORY',
  'MEDICATIONS',
  'INJURIES',
  'ACTIVITY',
  'REVIEW',
];

type JsonRecord = Record<string, unknown>;
type RequestMetadata = { ipAddress?: string; userAgent?: string };

export class HealthIntakeError extends Error {
  constructor(
    message: string,
    readonly code: HealthIntakeErrorCode,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HealthIntakeError';
  }
}

const jsonRecord = (value: Prisma.JsonValue | null | undefined): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as JsonRecord) }
    : {};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const optionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim().length > 0 ? value.trim() : null;
};

function privacyNoticeUrl(): string {
  const configured = process.env.HEALTH_PRIVACY_NOTICE_URL?.trim() || process.env.PRIVACY_NOTICE_URL?.trim();
  if (configured) return configured;
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${frontend}/privacidade`;
}

function nextStep(step: HealthIntakeStep): HealthIntakeStep {
  const index = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)];
}

function requireBasicPreRegistration(access: LockedPreRegistrationAccess) {
  if (access.status !== 'PRE_REGISTRATION_COMPLETED') {
    throw new HealthIntakeError(
      'Conclua primeiro os dados básicos do pré-cadastro.',
      'BASIC_PRE_REGISTRATION_REQUIRED'
    );
  }
}

function requireExpectedVersion(expectedVersion: number, currentVersion: number) {
  if (expectedVersion !== currentVersion) {
    throw new HealthIntakeError(
      'Esta Anamnese foi alterada em outro acesso. Recarregue os dados antes de continuar.',
      'CONCURRENT_MODIFICATION',
      { currentVersion }
    );
  }
}

function mergeStep(
  current: {
    clinicalHistoryData: Prisma.JsonValue | null;
    medicationData: Prisma.JsonValue | null;
    injuryData: Prisma.JsonValue | null;
    allergyData: Prisma.JsonValue | null;
    observations: string | null;
  } | null,
  input: SaveHealthIntakeStepDTO
) {
  const clinical = jsonRecord(current?.clinicalHistoryData);
  const medication = jsonRecord(current?.medicationData);
  const injury = jsonRecord(current?.injuryData);
  const allergy = jsonRecord(current?.allergyData);
  let observations: string | null | undefined = current?.observations ?? undefined;

  if (input.step === 'HEALTH_HISTORY') {
    if (input.data.mainGoal !== undefined) clinical.mainGoal = optionalText(input.data.mainGoal);
    if (input.data.hasMedicalConditions !== undefined) {
      clinical.hasMedicalConditions = input.data.hasMedicalConditions;
      if (!input.data.hasMedicalConditions) clinical.medicalHistory = null;
    }
    if (input.data.medicalHistory !== undefined) {
      clinical.medicalHistory = optionalText(input.data.medicalHistory);
    }
  }
  if (input.step === 'MEDICATIONS') {
    if (input.data.usesMedication !== undefined) {
      medication.usesMedication = input.data.usesMedication;
      if (!input.data.usesMedication) medication.currentMedications = null;
    }
    if (input.data.currentMedications !== undefined) {
      medication.currentMedications = optionalText(input.data.currentMedications);
    }
    if (input.data.hasAllergies !== undefined) {
      allergy.hasAllergies = input.data.hasAllergies;
      if (!input.data.hasAllergies) allergy.allergies = null;
    }
    if (input.data.allergies !== undefined) allergy.allergies = optionalText(input.data.allergies);
  }
  if (input.step === 'INJURIES') {
    if (input.data.hasInjuries !== undefined) {
      injury.hasInjuries = input.data.hasInjuries;
      if (!input.data.hasInjuries) injury.injuriesHistory = null;
    }
    if (input.data.injuriesHistory !== undefined) {
      injury.injuriesHistory = optionalText(input.data.injuriesHistory);
    }
    if (input.data.hasExerciseRestrictions !== undefined) {
      clinical.hasExerciseRestrictions = input.data.hasExerciseRestrictions;
      if (!input.data.hasExerciseRestrictions) clinical.exerciseRestrictions = null;
    }
    if (input.data.exerciseRestrictions !== undefined) {
      clinical.exerciseRestrictions = optionalText(input.data.exerciseRestrictions);
    }
  }
  if (input.step === 'ACTIVITY') {
    if (input.data.trainingBackground !== undefined) {
      clinical.trainingBackground = optionalText(input.data.trainingBackground);
    }
    if (input.data.observations !== undefined) observations = optionalText(input.data.observations);
  }

  return {
    clinicalHistoryData: clinical as Prisma.InputJsonValue,
    medicationData: medication as Prisma.InputJsonValue,
    injuryData: injury as Prisma.InputJsonValue,
    allergyData: allergy as Prisma.InputJsonValue,
    observations,
  };
}

function answersFrom(intake: {
  clinicalHistoryData: Prisma.JsonValue | null;
  medicationData: Prisma.JsonValue | null;
  injuryData: Prisma.JsonValue | null;
  allergyData: Prisma.JsonValue | null;
  observations: string | null;
} | null): HealthIntakeAnswersDTO {
  const clinical = jsonRecord(intake?.clinicalHistoryData);
  const medication = jsonRecord(intake?.medicationData);
  const injury = jsonRecord(intake?.injuryData);
  const allergy = jsonRecord(intake?.allergyData);
  return {
    mainGoal: text(clinical.mainGoal),
    hasMedicalConditions:
      typeof clinical.hasMedicalConditions === 'boolean' ? clinical.hasMedicalConditions : undefined,
    medicalHistory: text(clinical.medicalHistory),
    usesMedication:
      typeof medication.usesMedication === 'boolean' ? medication.usesMedication : undefined,
    currentMedications: text(medication.currentMedications),
    hasInjuries: typeof injury.hasInjuries === 'boolean' ? injury.hasInjuries : undefined,
    injuriesHistory: text(injury.injuriesHistory),
    hasAllergies: typeof allergy.hasAllergies === 'boolean' ? allergy.hasAllergies : undefined,
    allergies: text(allergy.allergies),
    hasExerciseRestrictions:
      typeof clinical.hasExerciseRestrictions === 'boolean'
        ? clinical.hasExerciseRestrictions
        : undefined,
    exerciseRestrictions: text(clinical.exerciseRestrictions),
    trainingBackground: text(clinical.trainingBackground),
    observations: text(intake?.observations),
  };
}

function validateCompletion(answers: HealthIntakeAnswersDTO) {
  const missing: string[] = [];
  for (const key of [
    'hasMedicalConditions',
    'usesMedication',
    'hasInjuries',
    'hasAllergies',
    'hasExerciseRestrictions',
  ] as const) {
    if (typeof answers[key] !== 'boolean') missing.push(key);
  }
  if (answers.hasMedicalConditions && !text(answers.medicalHistory)) missing.push('medicalHistory');
  if (answers.usesMedication && !text(answers.currentMedications)) missing.push('currentMedications');
  if (answers.hasInjuries && !text(answers.injuriesHistory)) missing.push('injuriesHistory');
  if (answers.hasAllergies && !text(answers.allergies)) missing.push('allergies');
  if (answers.hasExerciseRestrictions && !text(answers.exerciseRestrictions)) {
    missing.push('exerciseRestrictions');
  }
  if (missing.length > 0) {
    throw new HealthIntakeError(
      'Revise as perguntas obrigatórias antes de concluir.',
      'MISSING_REQUIRED_FIELDS',
      { fields: missing }
    );
  }
}

async function tenantView(tx: Prisma.TransactionClient, contractId: string) {
  const contract = await tx.companyContract.findUnique({
    where: { id: contractId },
    select: { name: true, tradeName: true, logoUrl: true },
  });
  if (!contract) throw new HealthIntakeError('Cadastro não encontrado.', 'NOT_FOUND');
  return {
    name: contract.tradeName || contract.name || 'Academia',
    logoUrl: contract.logoUrl || undefined,
    privacyNoticeUrl: privacyNoticeUrl(),
  };
}

async function buildSession(
  tx: Prisma.TransactionClient,
  access: LockedPreRegistrationAccess,
  userId: string
): Promise<HealthIntakeSessionDTO> {
  const [intake, tenant] = await Promise.all([
    tx.studentHealthIntake.findUnique({ where: { alunoId: access.alunoId } }),
    tenantView(tx, access.contractId),
  ]);
  return {
    alunoId: access.alunoId,
    status: intake?.status ?? 'NOT_STARTED',
    version: intake?.version ?? 1,
    currentStep: (intake?.currentStep as HealthIntakeStep | undefined) ?? 'CONSENT',
    formVersion: intake?.formVersion || HEALTH_FORM_VERSION,
    answers: answersFrom(intake),
    consent: {
      requiredVersion: HEALTH_NOTICE_VERSION,
      acceptedVersion: intake?.consentNoticeVersion || undefined,
      acceptedAt: intake?.consentAcceptedAt?.toISOString(),
    },
    respondent: {
      role: access.accessRole,
      userId,
    },
    lastSavedAt: intake?.lastSavedAt?.toISOString(),
    completedAt: intake?.completedAt?.toISOString(),
    declarationAcceptedAt: intake?.declarationAcceptedAt?.toISOString(),
    migratedFromLegacy: Boolean(intake?.legacyIntakeId),
    migrationReviewRequired: intake?.migrationReviewRequired ?? false,
    tenant,
  };
}

function resolveConsent(
  existing: { consentNoticeVersion: string | null; consentAcceptedAt: Date | null } | null,
  input: SaveHealthIntakeStepDTO
) {
  if (
    existing?.consentAcceptedAt &&
    existing.consentNoticeVersion === HEALTH_NOTICE_VERSION
  ) {
    return null;
  }
  if (!input.consent?.accepted) {
    throw new HealthIntakeError(
      'Leia e aceite o aviso de privacidade antes de salvar informações de saúde.',
      'CONSENT_REQUIRED'
    );
  }
  if (input.consent.privacyNoticeVersion !== HEALTH_NOTICE_VERSION) {
    throw new HealthIntakeError(
      'O aviso de privacidade foi atualizado. Revise a versão atual antes de continuar.',
      'CONSENT_VERSION_MISMATCH',
      { requiredVersion: HEALTH_NOTICE_VERSION }
    );
  }
  return new Date();
}

async function recordLifecycleEvent(
  tx: Prisma.TransactionClient,
  access: LockedPreRegistrationAccess,
  userId: string,
  eventType: 'HEALTH_INTAKE_STARTED' | 'HEALTH_INTAKE_SAVED' | 'HEALTH_INTAKE_COMPLETED',
  metadata: Prisma.InputJsonValue
) {
  await tx.studentLifecycleEvent.create({
    data: {
      alunoId: access.alunoId,
      contractId: access.contractId,
      actorUserId: userId,
      eventType,
      metadata,
    },
  });
}

export const preRegistrationHealthIntakeService = {
  async getSession(userId: string, alunoId: string) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      requireBasicPreRegistration(access);
      return buildSession(tx, access, userId);
    });
  },

  async saveStep(
    userId: string,
    alunoId: string,
    input: SaveHealthIntakeStepDTO,
    metadata: RequestMetadata = {}
  ) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      requireBasicPreRegistration(access);
      const existing = await tx.studentHealthIntake.findUnique({ where: { alunoId } });
      if (existing?.completedAt) {
        throw new HealthIntakeError('A Anamnese já foi concluída.', 'HEALTH_INTAKE_COMPLETED');
      }
      requireExpectedVersion(input.expectedVersion, existing?.version ?? 1);
      const acceptedAt = resolveConsent(existing, input);
      const now = new Date();
      const merged = mergeStep(existing, input);
      const next = nextStep(input.step);
      const common = {
        contractId: access.contractId,
        sourceType: 'student' as const,
        sourceReference: 'public_pre_registration_health_intake',
        recordedByUserId: userId,
        formVersion: HEALTH_FORM_VERSION,
        status: 'IN_PROGRESS' as const,
        currentStep: next,
        ...merged,
        respondentRole: access.accessRole,
        respondentUserId: userId,
        lastSavedAt: now,
        ...(acceptedAt
          ? {
              consentNoticeVersion: HEALTH_NOTICE_VERSION,
              consentAcceptedAt: acceptedAt,
              consentAcceptedByUserId: userId,
              consentAcceptedIp: metadata.ipAddress,
              consentAcceptedUserAgent: metadata.userAgent,
            }
          : {}),
      };
      const intake = existing
        ? await tx.studentHealthIntake.update({
            where: { id: existing.id },
            data: { ...common, version: { increment: 1 } },
          })
        : await tx.studentHealthIntake.create({
            data: {
              alunoId,
              ...common,
              version: 2,
              assessmentDate: now,
            },
          });

      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: {
          healthIntakeId: intake.id,
          healthModuleStatus: 'IN_PROGRESS',
          healthStartedAt: access.onboarding.healthStartedAt || now,
          healthLastSavedAt: now,
        },
      });
      const eventMetadata: Prisma.InputJsonObject = {
        healthIntakeId: intake.id,
        step: input.step,
        version: intake.version,
        ...(acceptedAt ? { consentNoticeVersion: HEALTH_NOTICE_VERSION } : {}),
      };
      await recordLifecycleEvent(
        tx,
        access,
        userId,
        existing ? 'HEALTH_INTAKE_SAVED' : 'HEALTH_INTAKE_STARTED',
        eventMetadata
      );
      return buildSession(tx, access, userId);
    });
  },

  async complete(userId: string, alunoId: string, input: CompleteHealthIntakeDTO) {
    return prisma.$transaction(async (tx) => {
      const access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      requireBasicPreRegistration(access);
      const existing = await tx.studentHealthIntake.findUnique({ where: { alunoId } });
      if (!existing) {
        throw new HealthIntakeError(
          'Salve ao menos uma etapa antes de concluir.',
          'MISSING_REQUIRED_FIELDS',
          { fields: ['healthIntake'] }
        );
      }
      if (existing.completedAt) return buildSession(tx, access, userId);
      requireExpectedVersion(input.expectedVersion, existing.version);
      if (
        !existing.consentAcceptedAt ||
        existing.consentNoticeVersion !== HEALTH_NOTICE_VERSION
      ) {
        throw new HealthIntakeError(
          'Aceite o aviso de privacidade atual antes de concluir.',
          'CONSENT_REQUIRED'
        );
      }
      validateCompletion(answersFrom(existing));
      const now = new Date();
      const intake = await tx.studentHealthIntake.update({
        where: { id: existing.id },
        data: {
          status: 'COMPLETED',
          currentStep: 'REVIEW',
          version: { increment: 1 },
          completedAt: now,
          completedByUserId: userId,
          declarationAcceptedAt: now,
          lastSavedAt: now,
        },
      });
      await tx.studentOnboardingProcess.update({
        where: { alunoId },
        data: {
          healthIntakeId: intake.id,
          healthModuleStatus: 'COMPLETED',
          healthLastSavedAt: now,
          healthCompletedAt: now,
        },
      });
      await recordLifecycleEvent(tx, access, userId, 'HEALTH_INTAKE_COMPLETED', {
        healthIntakeId: intake.id,
        version: intake.version,
      });
      return buildSession(tx, access, userId);
    });
  },
};
