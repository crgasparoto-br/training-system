import { Prisma, PrismaClient } from '@prisma/client';
import type {
  PreRegistrationSessionDTO,
  PreRegistrationStep,
  SavePreRegistrationStepDTO,
} from '@corrida/types';
import {
  loadStudentIdentity,
  upsertStudentIdentity,
  type StudentIdentityData,
} from '../alunos/student-identity.service.js';
import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';
import {
  lockAndAuthorizePreRegistrationProcess,
  startAuthorizedPreRegistrationInTransaction,
} from './pre-registration-public-atomic.service.js';

const prisma = new PrismaClient();

const PUBLIC_IDENTITY_FIELDS = [
  'name',
  'cpf',
  'birthDate',
  'gender',
  'phone',
  'additionalPhone',
  'email',
  'additionalEmail',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressNeighborhood',
  'addressCity',
  'addressState',
  'addressZipCode',
  'guardianName',
  'guardianCpf',
  'guardianPhone',
  'guardianEmail',
] as const;

type PublicIdentityField = (typeof PUBLIC_IDENTITY_FIELDS)[number];
type PublicIdentity = Partial<Record<PublicIdentityField, unknown>>;

type PreservationResult = {
  version: number;
  currentStep: PreRegistrationStep;
};

type PendingReview = {
  id: string;
  snapshotBefore: Prisma.JsonValue | null;
  snapshotAfter: Prisma.JsonValue | null;
  changedFields: Prisma.JsonValue | null;
  sectionsRequested: Prisma.JsonValue | null;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  identity: { birthDate?: string | Date | null },
  role: 'STUDENT' | 'GUARDIAN'
): PreRegistrationStep {
  switch (step) {
    case 'IDENTIFICATION':
      return 'CONTACT';
    case 'CONTACT':
      return 'ADDRESS';
    case 'ADDRESS':
      return isMinorBirthDate(identity.birthDate) || role === 'GUARDIAN'
        ? 'GUARDIAN'
        : 'PRIVACY';
    case 'GUARDIAN':
    case 'PRIVACY':
      return 'PRIVACY';
  }
}

function publicIdentityFrom(value: unknown): PublicIdentity {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    PUBLIC_IDENTITY_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(value, field))
      .map((field) => [field, value[field]])
  ) as PublicIdentity;
}

function overlayIdentity(base: PublicIdentity, pending: PublicIdentity): PublicIdentity {
  const result = { ...base };
  for (const field of PUBLIC_IDENTITY_FIELDS) {
    if (hasValue(pending[field])) {
      result[field] = pending[field];
    }
  }
  return result;
}

function parseStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function conflictFields(
  input: SavePreRegistrationStepDTO,
  detection: Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>
): PublicIdentityField[] {
  const fields = new Set<PublicIdentityField>();
  const inputKeys = new Set(Object.keys(input.data));

  for (const candidate of detection.candidates) {
    for (const signal of candidate.signals) {
      if (signal.code === 'CPF_EXACT' && inputKeys.has('cpf')) fields.add('cpf');
      if (signal.code === 'EMAIL_EXACT') {
        if (inputKeys.has('email')) fields.add('email');
        if (inputKeys.has('additionalEmail')) fields.add('additionalEmail');
      }
      if (signal.code === 'PHONE_EXACT') {
        if (inputKeys.has('phone')) fields.add('phone');
        if (inputKeys.has('additionalPhone')) fields.add('additionalPhone');
      }
      if (signal.code === 'NAME_AND_BIRTH_DATE') {
        if (inputKeys.has('name')) fields.add('name');
        if (inputKeys.has('birthDate')) fields.add('birthDate');
      }
    }
  }

  const hasAccountConflict = detection.candidates.some((candidate) =>
    candidate.signals.some((signal) =>
      signal.code === 'ACCOUNT_ALREADY_LINKED' || signal.code === 'ACCOUNT_INCOMPATIBLE'
    )
  );
  if (
    fields.size === 0 &&
    hasAccountConflict &&
    (input.step === 'IDENTIFICATION' || input.step === 'CONTACT')
  ) {
    for (const key of inputKeys) {
      if ((PUBLIC_IDENTITY_FIELDS as readonly string[]).includes(key)) {
        fields.add(key as PublicIdentityField);
      }
    }
  }

  return [...fields];
}

function reconcileConflictFields(
  previous: readonly string[],
  current: readonly PublicIdentityField[],
  input: SavePreRegistrationStepDTO
): PublicIdentityField[] {
  const fields = new Set(
    previous.filter((field): field is PublicIdentityField =>
      (PUBLIC_IDENTITY_FIELDS as readonly string[]).includes(field)
    )
  );
  for (const key of Object.keys(input.data)) {
    fields.delete(key as PublicIdentityField);
  }
  for (const field of current) fields.add(field);
  return [...fields];
}

function safePersistencePatch(
  input: SavePreRegistrationStepDTO,
  conflicts: readonly PublicIdentityField[]
): StudentIdentityData {
  const patch = { ...input.data } as Record<string, unknown>;

  // CPF idêntico é bloqueante e possui índice único na projeção normalizada.
  // Limpa o valor canônico anterior para que o detector use Aluno.leadCpf,
  // onde o novo CPF fica preservado sem projeção normalizada. O valor anterior
  // permanece em snapshotBefore e o novo valor em snapshotAfter.
  if (conflicts.includes('cpf')) patch.cpf = null;

  return patch as StudentIdentityData;
}

function hasIdentityValue(identity: PublicIdentity, field: string): boolean {
  return hasValue(identity[field as PublicIdentityField]);
}

async function pendingReviewFor(
  client: Prisma.TransactionClient | PrismaClient,
  userId: string,
  alunoId: string
): Promise<PendingReview | null> {
  return client.studentProfileReview.findFirst({
    where: {
      alunoId,
      requestedByUserId: userId,
      status: 'pending',
      requiresApproval: true,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      snapshotBefore: true,
      snapshotAfter: true,
      changedFields: true,
      sectionsRequested: true,
    },
  });
}

export const preRegistrationDuplicateReviewService = {
  async preserveCpfConflict(
    userId: string,
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<PreservationResult> {
    return this.preserveDuplicateConflict(userId, alunoId, input);
  },

  async hasPendingDuplicateReview(userId: string, alunoId: string): Promise<boolean> {
    return Boolean(await pendingReviewFor(prisma, userId, alunoId));
  },

  async preserveDuplicateConflict(
    userId: string,
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<PreservationResult> {
    return prisma.$transaction(async (tx) => {
      let access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.onboarding.version !== input.expectedVersion) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      access = await startAuthorizedPreRegistrationInTransaction(tx, access, userId);
      const existingReview = await pendingReviewFor(tx, userId, access.alunoId);
      const canonicalBefore = publicIdentityFrom(
        await loadStudentIdentity(access.alunoId, access.contractId, tx)
      );
      const pendingBefore = publicIdentityFrom(existingReview?.snapshotAfter);
      const currentIdentity = overlayIdentity(canonicalBefore, pendingBefore);
      const originalBefore = existingReview
        ? publicIdentityFrom(existingReview.snapshotBefore)
        : currentIdentity;
      const proposed = {
        ...currentIdentity,
        ...publicIdentityFrom(input.data),
      };
      const detection = await detectPreRegistrationDuplicates(tx, {
        contractId: access.contractId,
        alunoId: access.alunoId,
        overrides: proposed as StudentIdentityData,
      });
      const currentConflicts = conflictFields(input, detection);
      const conflicts = reconcileConflictFields(
        parseStringArray(existingReview?.changedFields),
        currentConflicts,
        input
      );
      const patch = safePersistencePatch(input, conflicts);

      const persisted = publicIdentityFrom(await upsertStudentIdentity(
        access.alunoId,
        access.contractId,
        patch,
        {
          client: tx,
          actor: { userId },
          sourceType: 'student',
          sourceReference: 'public_pre_registration_duplicate_review',
          syncLegacyProfile: access.accessRole === 'STUDENT',
        }
      ));
      const after = {
        ...overlayIdentity(persisted, pendingBefore),
        ...publicIdentityFrom(input.data),
      };

      const pendingCpf = conflicts.includes('cpf') ? cleanText(proposed.cpf) : undefined;
      if (pendingCpf) {
        await tx.aluno.update({
          where: { id: access.alunoId },
          data: {
            leadCpf: pendingCpf,
            leadCpfNormalized: null,
          },
        });
        after.cpf = pendingCpf;
      }

      access = await lockAndAuthorizePreRegistrationProcess(tx, userId, alunoId);
      if (access.onboarding.version !== input.expectedVersion) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      const reviewStillRequired = conflicts.length > 0;
      if (reviewStillRequired) {
        const sections = new Set(parseStringArray(existingReview?.sectionsRequested));
        if (input.step === 'IDENTIFICATION') sections.add('identification');
        if (input.step === 'CONTACT') sections.add('contact');
        const reviewData = {
          requestedByUserId: userId,
          requestedAt: new Date(),
          sectionsRequested: asJson([...sections]),
          snapshotBefore: asJson(originalBefore),
          snapshotAfter: asJson(after),
          changedFields: asJson(conflicts),
          requiresApproval: true,
        };

        if (existingReview) {
          await tx.studentProfileReview.update({
            where: { id: existingReview.id },
            data: reviewData,
          });
        } else {
          await tx.studentProfileReview.create({
            data: {
              alunoId: access.alunoId,
              ...reviewData,
            },
          });
        }
      } else if (existingReview) {
        await tx.studentProfileReview.update({
          where: { id: existingReview.id },
          data: {
            status: 'canceled',
            completedAt: new Date(),
            requiresApproval: false,
            snapshotAfter: asJson(after),
            changedFields: asJson([]),
          },
        });
      }

      const currentStep = nextStepAfter(
        input.step,
        { birthDate: after.birthDate as string | Date | null | undefined },
        access.accessRole
      );
      const updated = await tx.$executeRaw`
        UPDATE "StudentOnboardingProcess"
        SET "version" = "version" + 1,
            "currentStep" = ${currentStep},
            "lastSavedAt" = CURRENT_TIMESTAMP,
            "formVersion" = 'pre-registration-v1',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "alunoId" = ${access.alunoId}
          AND "contractId" = ${access.contractId}
          AND "claimedByUserId" = ${userId}
          AND "claimRole" = ${access.accessRole}
          AND "version" = ${input.expectedVersion}
      `;
      if (updated !== 1) {
        throw new Error('O rascunho foi alterado em outro acesso. Recarregue antes de continuar.');
      }

      if (reviewStillRequired && (currentConflicts.length > 0 || !existingReview)) {
        const signalCodes = [...new Set(
          detection.candidates.flatMap((candidate) => candidate.signals.map((signal) => signal.code))
        )];
        await tx.studentLifecycleEvent.create({
          data: {
            alunoId: access.alunoId,
            contractId: access.contractId,
            eventType: 'ADMIN_REVIEWED',
            actorUserId: userId,
            metadata: {
              source: 'public_pre_registration',
              action: 'duplicate_review_requested',
              classification: detection.classification,
              fields: conflicts,
              signalCodes,
              draftPreserved: true,
            },
          },
        });
      }

      return { version: input.expectedVersion + 1, currentStep };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async projectPublicSession(
    userId: string,
    alunoId: string,
    session: PreRegistrationSessionDTO
  ): Promise<PreRegistrationSessionDTO> {
    const pendingReview = await pendingReviewFor(prisma, userId, alunoId);
    const identity = overlayIdentity(
      publicIdentityFrom(session.identity),
      publicIdentityFrom(pendingReview?.snapshotAfter)
    ) as PreRegistrationSessionDTO['identity'];

    return {
      ...session,
      identity,
      // Sinais de existência de outro cadastro nunca atravessam a fronteira pública.
      duplicateWarnings: [],
      missingRequiredFields: session.missingRequiredFields.filter(
        (field) => !hasIdentityValue(identity as PublicIdentity, field)
      ),
    };
  },
};
