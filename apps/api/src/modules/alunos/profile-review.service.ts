import { assertNoLegacyParqWrite } from './student-parq-legacy-cutover.js';
import { Prisma, PrismaClient, StudentProfileReviewStatus } from '@prisma/client';
import { notificationService } from '../notifications/notification.service.js';
import type { ExternalNotificationDeliveryResult } from '../notifications/notification-delivery.service.js';
import { profileAuditService } from './profile-audit.service.js';
import { createOrReusePendingProfileReview } from './profile-review-request.service.js';
import { loadStudentIdentity, upsertStudentIdentity } from './student-identity.service.js';
import {
  hasCanonicalHealthIntakeMutation,
  upsertCanonicalStudentHealthIntake,
  type LegacyHealthIntakeWriteInput,
} from './student-health-intake-write.service.js';

const prisma = new PrismaClient();

export type ProfileReviewSection =
  | 'personal'
  | 'contact'
  | 'address'
  | 'preferences'
  | 'health'
  | 'anamnesis'
  | 'other';

export interface ProfileReviewCreateInput {
  alunoId: string;
  requestedByUserId?: string | null;
  dueAt?: Date;
  sectionsRequested?: string[];
}

export interface ProfileReviewSettingsUpdateInput {
  alunoId: string;
  reviewPeriodMonths?: number | null;
  nextReviewAt?: Date | null;
  isReviewRequired?: boolean;
}

export interface ProfileReviewCompleteChangesInput {
  profile?: {
    name?: string;
    phone?: string | null;
    birthDate?: string | null;
    gender?: 'male' | 'female' | 'other' | null;
    cpf?: string | null;
    rg?: string | null;
    maritalStatus?:
      | 'single'
      | 'married'
      | 'stable_union'
      | 'divorced'
      | 'separated'
      | 'widowed'
      | 'other'
      | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    addressNeighborhood?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZipCode?: string | null;
    instagramHandle?: string | null;
  };
  aluno?: {
    age?: number;
    weight?: number | null;
    height?: number | null;
    bodyFatPercentage?: number | null;
    vo2Max?: number | null;
    anaerobicThreshold?: number | null;
    maxHeartRate?: number | null;
    restingHeartRate?: number | null;
    systolicPressure?: number | null;
    diastolicPressure?: number | null;
  };
  intakeForm?: {
    assessmentDate?: string | null;
    mainGoal?: string | null;
    medicalHistory?: string | null;
    currentMedications?: string | null;
    injuriesHistory?: string | null;
    trainingBackground?: string | null;
    observations?: string | null;
    parqResponses?: {
      q1?: boolean;
      q2?: boolean;
      q3?: boolean;
      q4?: boolean;
      q5?: boolean;
      q6?: boolean;
      q7?: boolean;
      q8?: boolean;
    };
  };
}

export interface ProfileReviewCompleteInput {
  reviewId: string;
  alunoUserId: string;
  alunoId: string;
  contractId: string;
  noChanges?: boolean;
  changes?: ProfileReviewCompleteChangesInput;
}

type SnapshotRecord = Record<string, unknown>;

type ChangedField = {
  path: string;
  before: unknown;
  after: unknown;
  requiresApproval: boolean;
  status: 'applied' | 'pending_approval' | 'approved' | 'rejected';
};

const DEFAULT_SECTIONS: ProfileReviewSection[] = [
  'personal',
  'contact',
  'address',
  'preferences',
  'health',
  'anamnesis',
];

const SENSITIVE_FIELDS = new Set<string>([
  'profile.cpf',
  'profile.rg',
  'profile.birthDate',
  'profile.maritalStatus',
  'intakeForm.medicalHistory',
  'intakeForm.currentMedications',
  'intakeForm.injuriesHistory',
  'intakeForm.parqResponses',
  'aluno.systolicPressure',
  'aluno.diastolicPressure',
  'aluno.maxHeartRate',
  'aluno.restingHeartRate',
]);

const EMPTY_PATCH = {
  profile: {},
  aluno: {},
  intakeForm: {},
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeSnapshotValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeSnapshotValue(item)])
    );
  }

  return value;
};

const normalizeSections = (value: Prisma.JsonValue | null | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SECTIONS];
  }

  const sections = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  return sections.length ? sections : [...DEFAULT_SECTIONS];
};

const parseJsonRecord = (value: Prisma.JsonValue | null | undefined): SnapshotRecord => {
  if (!isPlainObject(value)) {
    return {};
  }

  return value;
};

const getByPath = (obj: unknown, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (!isPlainObject(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
};

const setByPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.');
  let current: Record<string, unknown> = target;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];

    if (i === parts.length - 1) {
      current[part] = value;
      return;
    }

    const nextValue = current[part];
    if (!isPlainObject(nextValue)) {
      current[part] = {};
    }

    current = current[part] as Record<string, unknown>;
  }
};

const flattenPatch = (
  patch: Record<string, unknown>,
  prefix = ''
): Array<{ path: string; value: unknown }> => {
  const entries: Array<{ path: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      const nested = flattenPatch(value, path);
      if (nested.length === 0) {
        continue;
      }
      entries.push(...nested);
      continue;
    }

    entries.push({ path, value });
  }

  return entries;
};

const valuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeSnapshotValue(left)) === JSON.stringify(normalizeSnapshotValue(right));

const isSensitivePath = (path: string) => {
  for (const sensitivePath of SENSITIVE_FIELDS) {
    if (path === sensitivePath || path.startsWith(`${sensitivePath}.`)) {
      return true;
    }
  }

  return false;
};

const hasOwnValues = (value: unknown) => {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.keys(value).length > 0;
};

const toDateOrNull = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data inválida recebida na revisão cadastral');
  }

  return parsed;
};

const addMonths = (baseDate: Date, months: number) => {
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
};

const extractChangedFields = (
  beforeSnapshot: SnapshotRecord,
  mergedAfterSnapshot: SnapshotRecord,
  rawPatch: Record<string, unknown>
): ChangedField[] => {
  const patchLeaves = flattenPatch(rawPatch);
  const changedFields: ChangedField[] = [];

  for (const leaf of patchLeaves) {
    const beforeValue = getByPath(beforeSnapshot, leaf.path);
    const afterValue = getByPath(mergedAfterSnapshot, leaf.path);

    if (valuesEqual(beforeValue, afterValue)) {
      continue;
    }

    const requiresApproval = isSensitivePath(leaf.path);

    changedFields.push({
      path: leaf.path,
      before: normalizeSnapshotValue(beforeValue),
      after: normalizeSnapshotValue(afterValue),
      requiresApproval,
      status: requiresApproval ? 'pending_approval' : 'applied',
    });
  }

  return changedFields;
};

const mergeSnapshots = (base: SnapshotRecord, patch: Record<string, unknown>): SnapshotRecord => {
  const merged: SnapshotRecord = JSON.parse(JSON.stringify(base));
  const patchLeaves = flattenPatch(patch);

  for (const leaf of patchLeaves) {
    setByPath(merged, leaf.path, normalizeSnapshotValue(leaf.value));
  }

  return merged;
};

const buildPatchByApproval = (changedFields: ChangedField[], requireSensitive: boolean) => {
  const result: Record<string, unknown> = {
    profile: {},
    aluno: {},
    intakeForm: {},
  };

  for (const field of changedFields) {
    if (field.requiresApproval !== requireSensitive) {
      continue;
    }

    setByPath(result, field.path, field.after);
  }

  return result;
};

const parseChangedFields = (value: Prisma.JsonValue | null | undefined): ChangedField[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: ChangedField[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) {
      continue;
    }

    const path = typeof item.path === 'string' ? item.path : null;
    if (!path) {
      continue;
    }

    const status =
      item.status === 'applied' ||
      item.status === 'pending_approval' ||
      item.status === 'approved' ||
      item.status === 'rejected'
        ? item.status
        : 'applied';

    parsed.push({
      path,
      before: item.before,
      after: item.after,
      requiresApproval: item.requiresApproval === true,
      status,
    });
  }

  return parsed;
};

const castJson = (value: unknown): Prisma.InputJsonValue =>
  normalizeSnapshotValue(value) as Prisma.InputJsonValue;

const assertActiveReviewScope = async (
  tx: Prisma.TransactionClient,
  input: Pick<ProfileReviewCompleteInput, 'reviewId' | 'alunoUserId' | 'alunoId' | 'contractId'>
) => {
  const activeAluno = await tx.aluno.findFirst({
    where: {
      id: input.alunoId,
      userId: input.alunoUserId,
      contractId: input.contractId,
      status: 'ACTIVE_STUDENT',
    },
    select: { id: true },
  });

  if (!activeAluno) {
    throw new Error('Revisão cadastral não encontrada');
  }
};

const updatePendingProfileReview = async (
  tx: Prisma.TransactionClient,
  reviewId: string,
  alunoId: string,
  data: Prisma.StudentProfileReviewUpdateInput
) => {
  try {
    return await tx.studentProfileReview.update({
      where: {
        id: reviewId,
        alunoId,
        status: StudentProfileReviewStatus.pending,
      },
      data,
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      throw new Error('A revisão cadastral não está pendente');
    }
    throw error;
  }
};

const applyAlunoPatch = async (
  tx: Prisma.TransactionClient,
  alunoId: string,
  alunoUserId: string,
  patch: Record<string, unknown>
) => {
  assertNoLegacyParqWrite(patch);
  const profilePatch = parseJsonRecord(patch.profile as Prisma.JsonValue | undefined);
  const alunoPatch = parseJsonRecord(patch.aluno as Prisma.JsonValue | undefined);
  const intakePatch = parseJsonRecord(patch.intakeForm as Prisma.JsonValue | undefined);

  if (hasOwnValues(profilePatch)) {
    const scopedAluno = await tx.aluno.findUnique({
      where: { id: alunoId },
      select: { contractId: true, userId: true },
    });
    if (!scopedAluno || scopedAluno.userId !== alunoUserId) {
      throw new Error('Aluno não encontrado para aplicar revisão cadastral');
    }

    await upsertStudentIdentity(
      alunoId,
      scopedAluno.contractId,
      profilePatch,
      {
        client: tx,
        actor: { userId: alunoUserId },
        sourceType: 'student',
        sourceReference: 'profile_review',
        syncLegacyProfile: true,
      }
    );
  }

  if (hasOwnValues(alunoPatch)) {
    await tx.aluno.update({
      where: { id: alunoId },
      data: alunoPatch as Prisma.AlunoUpdateInput,
    });
  }

  if (hasOwnValues(intakePatch)) {
    const healthKeys = [
      'assessmentDate',
      'mainGoal',
      'medicalHistory',
      'currentMedications',
      'injuriesHistory',
      'trainingBackground',
      'observations',
    ] as const;
    const healthPatch: LegacyHealthIntakeWriteInput = {};
    for (const key of healthKeys) {
      if (!(key in intakePatch)) continue;
      if (key === 'assessmentDate') {
        healthPatch.assessmentDate = toDateOrNull(
          intakePatch.assessmentDate as string | null | undefined
        );
      } else {
        healthPatch[key] = intakePatch[key] as string | null | undefined;
      }
    }

    const aluno = await tx.aluno.findUnique({
      where: { id: alunoId },
      select: {
        contractId: true,
        userId: true,
      },
    });
    if (!aluno || aluno.userId !== alunoUserId) {
      throw new Error('Aluno não encontrado para aplicar revisão cadastral');
    }
    const contractId = aluno.contractId;

    if (hasCanonicalHealthIntakeMutation(healthPatch)) {
      await upsertCanonicalStudentHealthIntake(tx, {
        alunoId,
        contractId,
        sourceType: 'student',
        sourceReference: 'profile_review',
        recordedByUserId: alunoUserId,
        health: healthPatch,
      });
    }
  }
};

const mapReviewSummary = (review: {
  id: string;
  requestedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  status: StudentProfileReviewStatus;
  requiresApproval: boolean;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  changedFields: Prisma.JsonValue | null;
}) => {
  const changedFields = parseChangedFields(review.changedFields);
  const hasPendingApproval = changedFields.some(
    (field) => field.requiresApproval && field.status === 'pending_approval'
  );

  return {
    id: review.id,
    status: review.status,
    requestedAt: review.requestedAt,
    dueAt: review.dueAt,
    completedAt: review.completedAt,
    changedFields,
    approval: {
      requiresApproval: review.requiresApproval,
      hasPendingApproval,
      approvedAt: review.approvedAt,
      approvedByUserId: review.approvedByUserId,
      rejectedAt: review.rejectedAt,
      rejectedByUserId: review.rejectedByUserId,
      rejectionReason: review.rejectionReason,
    },
  };
};

export const profileReviewService = {
  async getAlunoSnapshot(alunoId: string, tx?: Prisma.TransactionClient): Promise<SnapshotRecord> {
    const client = tx ?? prisma;
    const aluno = await client.aluno.findUnique({
      where: { id: alunoId },
      include: {
        user: {
          select: {
            id: true,
            profile: true,
          },
        },
        intakeForm: true,
      },
    });

    if (!aluno?.user) {
      throw new Error('Aluno não encontrado para snapshot da revisão');
    }
    const identity = await loadStudentIdentity(alunoId, aluno.contractId, client);

    return castJson({
      profile: {
        name: identity.name,
        phone: identity.phone,
        birthDate: identity.birthDate,
        gender: identity.gender,
        cpf: identity.cpf,
        rg: identity.rg,
        maritalStatus: identity.maritalStatus,
        addressStreet: identity.addressStreet,
        addressNumber: identity.addressNumber,
        addressComplement: identity.addressComplement,
        addressNeighborhood: identity.addressNeighborhood,
        addressCity: identity.addressCity,
        addressState: identity.addressState,
        addressZipCode: identity.addressZipCode,
        instagramHandle: identity.instagramHandle,
      },
      aluno: {
        age: aluno.age,
        weight: aluno.weight,
        height: aluno.height,
        bodyFatPercentage: aluno.bodyFatPercentage,
        vo2Max: aluno.vo2Max,
        anaerobicThreshold: aluno.anaerobicThreshold,
        maxHeartRate: aluno.maxHeartRate,
        restingHeartRate: aluno.restingHeartRate,
        systolicPressure: aluno.systolicPressure,
        diastolicPressure: aluno.diastolicPressure,
      },
      intakeForm: {
        assessmentDate: aluno.intakeForm?.assessmentDate,
        mainGoal: aluno.intakeForm?.mainGoal,
        medicalHistory: aluno.intakeForm?.medicalHistory,
        currentMedications: aluno.intakeForm?.currentMedications,
        injuriesHistory: aluno.intakeForm?.injuriesHistory,
        trainingBackground: aluno.intakeForm?.trainingBackground,
        observations: aluno.intakeForm?.observations,
        parqResponses: aluno.intakeForm?.parqResponses,
      },
    }) as SnapshotRecord;
  },

  async getEffectiveSettings(alunoId: string) {
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: {
        professor: {
          select: {
            contractId: true,
          },
        },
      },
    });

    if (!aluno) {
      throw new Error('Aluno não encontrado');
    }
    const [settings, policy] = await Promise.all([
      prisma.alunoProfileReviewSettings.findUnique({
        where: { alunoId },
      }),
      prisma.profileReviewPolicy.findFirst({
        where: {
          contractId: aluno.contractId,
          isActive: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
    ]);

    const effectiveReviewPeriodMonths =
      settings?.reviewPeriodMonths ?? policy?.defaultReviewPeriodMonths ?? 4;

    return {
      alunoId,
      settings,
      policy,
      effective: {
        reviewPeriodMonths: effectiveReviewPeriodMonths,
        nextReviewAt: settings?.nextReviewAt ?? null,
        isReviewRequired: settings?.isReviewRequired ?? true,
        sectionsRequested: normalizeSections(policy?.sections),
      },
    };
  },

  async updateSettings(input: ProfileReviewSettingsUpdateInput) {
    return prisma.alunoProfileReviewSettings.upsert({
      where: { alunoId: input.alunoId },
      create: {
        alunoId: input.alunoId,
        reviewPeriodMonths: input.reviewPeriodMonths ?? null,
        nextReviewAt: input.nextReviewAt ?? null,
        isReviewRequired: input.isReviewRequired ?? true,
      },
      update: {
        ...(input.reviewPeriodMonths !== undefined
          ? { reviewPeriodMonths: input.reviewPeriodMonths }
          : {}),
        ...(input.nextReviewAt !== undefined ? { nextReviewAt: input.nextReviewAt } : {}),
        ...(input.isReviewRequired !== undefined
          ? { isReviewRequired: input.isReviewRequired }
          : {}),
      },
    });
  },

  async createManualReview(input: ProfileReviewCreateInput) {
    const aluno = await prisma.aluno.findUnique({
      where: { id: input.alunoId },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!aluno?.user?.id) {
      throw new Error('Aluno não encontrado');
    }

    const [snapshotBefore, settingsData] = await Promise.all([
      this.getAlunoSnapshot(input.alunoId),
      this.getEffectiveSettings(input.alunoId),
    ]);
    const requestedSections = input.sectionsRequested ?? settingsData.effective.sectionsRequested;
    const { review, reviewCreated } = await createOrReusePendingProfileReview(prisma, {
      alunoId: input.alunoId,
      requestedByUserId: input.requestedByUserId ?? null,
      dueAt: input.dueAt,
      sectionsRequested: castJson(requestedSections),
      snapshotBefore: castJson(snapshotBefore),
    });
    const effectiveDueAt = review.dueAt ?? null;
    const effectiveSections = normalizeSections(review.sectionsRequested);

    let notification: {
      persisted: boolean;
      deduplicated: boolean;
      delivery: ExternalNotificationDeliveryResult | null;
      error: string | null;
    } = {
      persisted: false,
      deduplicated: false,
      delivery: null,
      error: null,
    };

    try {
      const createdNotification = await notificationService.create({
        userId: aluno.user.id,
        type: 'profile_review_requested',
        title: 'Revisão cadastral solicitada',
        message:
          input.requestedByUserId
            ? effectiveDueAt
              ? `Seu professor solicitou revisão cadastral. Prazo: ${effectiveDueAt.toISOString()}.`
              : 'Seu professor solicitou revisão cadastral.'
            : effectiveDueAt
              ? `Uma revisão cadastral está disponível para você. Prazo: ${effectiveDueAt.toISOString()}.`
              : 'Uma revisão cadastral está disponível para você.',
        payload: {
          alunoId: input.alunoId,
          reviewId: review.id,
          event: 'profile_review_requested',
          dueAt: effectiveDueAt?.toISOString() ?? null,
          path: '/student/profile-review',
          deepLink: 'acesso://student/profile-review',
          sectionsRequested: effectiveSections,
        },
        dedupeWindowMinutes: 30,
        dispatchExternal: true,
      });

      notification = createdNotification
        ? {
            persisted: true,
            deduplicated: false,
            delivery: createdNotification.delivery,
            error: null,
          }
        : {
            persisted: true,
            deduplicated: true,
            delivery: null,
            error: null,
          };
    } catch {
      console.error('Falha ao registrar a notificação da revisão cadastral');
      notification = {
        persisted: false,
        deduplicated: false,
        delivery: null,
        error: 'Não foi possível registrar a notificação da revisão cadastral',
      };
    }

    await profileAuditService.log({
      alunoId: input.alunoId,
      changedByUserId: input.requestedByUserId ?? null,
      source: input.requestedByUserId ? 'web_admin' : 'system_review',
      action: 'request_review',
      afterData: {
        reviewId: review.id,
        dueAt: effectiveDueAt?.toISOString() ?? null,
        reviewCreated,
        notificationDeduplicated: notification.deduplicated,
      },
    });

    const requestAction = reviewCreated
      ? 'created'
      : !notification.persisted
        ? 'existing_pending_notification_failed'
        : notification.deduplicated
          ? 'existing_pending'
          : 'existing_pending_notified';

    return {
      ...review,
      reviewCreated,
      requestAction,
      notification,
    };
  },

  async listByAluno(alunoId: string) {
    const reviews = await prisma.studentProfileReview.findMany({
      where: { alunoId },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    return reviews.map((review) => mapReviewSummary(review));
  },

  async completeByStudent(input: ProfileReviewCompleteInput) {
    const review = await prisma.studentProfileReview.findUnique({
      where: { id: input.reviewId },
      include: {
        aluno: {
          include: {
            user: {
              select: {
                id: true,
              },
            },
            professor: {
              select: {
                contractId: true,
              },
            },
          },
        },
      },
    });

    if (!review || !review.aluno?.user?.id) {
      throw new Error('Revisão cadastral não encontrada');
    }

    if (review.alunoId !== input.alunoId || review.aluno.contractId !== input.contractId) {
      throw new Error('Revisão cadastral não encontrada');
    }

    if (review.aluno.user.id !== input.alunoUserId) {
      throw new Error('Você não tem permissão para concluir esta revisão');
    }

    if (review.status !== StudentProfileReviewStatus.pending) {
      throw new Error('A revisão cadastral não está pendente');
    }
    const now = new Date();
    const [settings, policy, freshSnapshot] = await Promise.all([
      prisma.alunoProfileReviewSettings.findUnique({
        where: { alunoId: review.alunoId },
      }),
      prisma.profileReviewPolicy.findFirst({
        where: {
          contractId: review.aluno.contractId,
          isActive: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      this.getAlunoSnapshot(review.alunoId),
    ]);

    const reviewPeriodMonths = settings?.reviewPeriodMonths ?? policy?.defaultReviewPeriodMonths ?? 4;
    const nextReviewAt = addMonths(now, reviewPeriodMonths);

    const hasChanges = input.changes && Object.keys(input.changes).length > 0;

    if (input.noChanges || !hasChanges) {
      const updated = await prisma.$transaction(async (tx) => {
        await assertActiveReviewScope(tx, input);
        const updatedReview = await updatePendingProfileReview(tx, review.id, input.alunoId, {
          status: StudentProfileReviewStatus.completed_no_changes,
          completedAt: now,
          requiresApproval: false,
          changedFields: castJson([]),
          snapshotBefore: review.snapshotBefore ?? castJson(freshSnapshot),
          snapshotAfter: castJson(freshSnapshot),
          nextReviewAt,
        });

        await tx.alunoProfileReviewSettings.upsert({
          where: { alunoId: review.alunoId },
          create: {
            alunoId: review.alunoId,
            reviewPeriodMonths: settings?.reviewPeriodMonths ?? null,
            isReviewRequired: settings?.isReviewRequired ?? true,
            nextReviewAt,
          },
          update: {
            nextReviewAt,
          },
        });

        await assertActiveReviewScope(tx, input);
        return updatedReview;
      });

      await profileAuditService.log({
        alunoId: review.alunoId,
        changedByUserId: input.alunoUserId,
        source: 'student_app',
        action: 'submit_review',
        afterData: { reviewId: review.id, noChanges: true },
      });

      return mapReviewSummary(updated);
    }

    const rawPatch = (input.changes ?? {}) as Record<string, unknown>;
    const beforeSnapshot = review.snapshotBefore
      ? parseJsonRecord(review.snapshotBefore as Prisma.JsonValue)
      : freshSnapshot;
    const mergedAfterSnapshot = mergeSnapshots(beforeSnapshot, rawPatch);
    const changedFields = extractChangedFields(beforeSnapshot, mergedAfterSnapshot, rawPatch);

    if (changedFields.length === 0) {
      const updated = await prisma.$transaction(async (tx) => {
        await assertActiveReviewScope(tx, input);
        const updatedReview = await updatePendingProfileReview(tx, review.id, input.alunoId, {
          status: StudentProfileReviewStatus.completed_no_changes,
          completedAt: now,
          requiresApproval: false,
          changedFields: castJson([]),
          snapshotBefore: castJson(beforeSnapshot),
          snapshotAfter: castJson(beforeSnapshot),
          nextReviewAt,
        });

        await tx.alunoProfileReviewSettings.upsert({
          where: { alunoId: review.alunoId },
          create: {
            alunoId: review.alunoId,
            reviewPeriodMonths: settings?.reviewPeriodMonths ?? null,
            isReviewRequired: settings?.isReviewRequired ?? true,
            nextReviewAt,
          },
          update: {
            nextReviewAt,
          },
        });

        await assertActiveReviewScope(tx, input);
        return updatedReview;
      });

      await profileAuditService.log({
        alunoId: review.alunoId,
        changedByUserId: input.alunoUserId,
        source: 'student_app',
        action: 'submit_review',
        afterData: { reviewId: review.id, noChanges: true },
      });

      return mapReviewSummary(updated);
    }

    const directPatch = buildPatchByApproval(changedFields, false);
    const hasSensitiveChanges = changedFields.some((field) => field.requiresApproval);

    const updated = await prisma.$transaction(async (tx) => {
      await assertActiveReviewScope(tx, input);
      const updatedReview = await updatePendingProfileReview(tx, review.id, input.alunoId, {
        status: StudentProfileReviewStatus.completed_with_changes,
        completedAt: now,
        requiresApproval: hasSensitiveChanges,
        changedFields: castJson(changedFields),
        snapshotBefore: castJson(beforeSnapshot),
        snapshotAfter: castJson(mergedAfterSnapshot),
        nextReviewAt,
      });

      await applyAlunoPatch(tx, review.alunoId, review.aluno.user!.id, directPatch);

      await tx.alunoProfileReviewSettings.upsert({
        where: { alunoId: review.alunoId },
        create: {
          alunoId: review.alunoId,
          reviewPeriodMonths: settings?.reviewPeriodMonths ?? null,
          isReviewRequired: settings?.isReviewRequired ?? true,
          nextReviewAt,
        },
        update: {
          nextReviewAt,
        },
      });

      await assertActiveReviewScope(tx, input);
      return updatedReview;
    });

    await profileAuditService.log({
      alunoId: review.alunoId,
      changedByUserId: input.alunoUserId,
      source: 'student_app',
      action: 'submit_review',
      beforeData: beforeSnapshot,
      afterData: mergedAfterSnapshot,
      changedFields: changedFields.map((f) => ({
        path: f.path,
        requiresApproval: f.requiresApproval,
        status: f.status,
      })),
    });

    return mapReviewSummary(updated);
  },

  async approveReview(alunoId: string, reviewId: string, approvedByUserId: string) {
    const review = await prisma.studentProfileReview.findUnique({
      where: { id: reviewId },
      include: {
        aluno: {
          include: {
            user: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!review || !review.aluno?.user?.id || review.alunoId !== alunoId) {
      throw new Error('Revisão cadastral não encontrada para o aluno informado');
    }

    const changedFields = parseChangedFields(review.changedFields);
    const pendingSensitive = changedFields.filter(
      (field) => field.requiresApproval && field.status === 'pending_approval'
    );

    if (pendingSensitive.length === 0) {
      throw new Error('Esta revisão não possui alterações sensíveis pendentes de aprovação');
    }

    const snapshotAfter = parseJsonRecord(review.snapshotAfter);
    const sensitivePatch = buildPatchByApproval(
      pendingSensitive.map((field) => ({
        ...field,
        after: getByPath(snapshotAfter, field.path),
      })),
      true
    );

    const now = new Date();
    const changedFieldsAfterApproval = changedFields.map((field) => {
      if (field.requiresApproval && field.status === 'pending_approval') {
        return {
          ...field,
          status: 'approved' as const,
        };
      }

      return field;
    });

    const updated = await prisma.$transaction(async (tx) => {
      await applyAlunoPatch(tx, review.alunoId, review.aluno.user!.id, sensitivePatch);

      return tx.studentProfileReview.update({
        where: { id: review.id },
        data: {
          approvedByUserId,
          approvedAt: now,
          rejectedByUserId: null,
          rejectedAt: null,
          rejectionReason: null,
          requiresApproval: false,
          changedFields: castJson(changedFieldsAfterApproval),
        },
      });
    });

    await profileAuditService.log({
      alunoId,
      changedByUserId: approvedByUserId,
      source: 'web_admin',
      action: 'approve_change',
      afterData: { reviewId, approvedFields: pendingSensitive.map((f) => f.path) },
    });

    return mapReviewSummary(updated);
  },

  async rejectReview(
    alunoId: string,
    reviewId: string,
    rejectedByUserId: string,
    rejectionReason: string
  ) {
    const review = await prisma.studentProfileReview.findUnique({
      where: { id: reviewId },
    });

    if (!review || review.alunoId !== alunoId) {
      throw new Error('Revisão cadastral não encontrada para o aluno informado');
    }

    const changedFields = parseChangedFields(review.changedFields);
    const pendingSensitive = changedFields.some(
      (field) => field.requiresApproval && field.status === 'pending_approval'
    );

    if (!pendingSensitive) {
      throw new Error('Esta revisão não possui alterações sensíveis pendentes de rejeição');
    }

    const changedFieldsAfterRejection = changedFields.map((field) => {
      if (field.requiresApproval && field.status === 'pending_approval') {
        return {
          ...field,
          status: 'rejected' as const,
        };
      }

      return field;
    });

    const updated = await prisma.studentProfileReview.update({
      where: { id: review.id },
      data: {
        rejectedByUserId,
        rejectedAt: new Date(),
        rejectionReason,
        approvedByUserId: null,
        approvedAt: null,
        requiresApproval: false,
        changedFields: castJson(changedFieldsAfterRejection),
      },
    });

    await profileAuditService.log({
      alunoId,
      changedByUserId: rejectedByUserId,
      source: 'web_admin',
      action: 'reject_change',
      afterData: { reviewId, rejectionReason },
    });

    return mapReviewSummary(updated);
  },
};
