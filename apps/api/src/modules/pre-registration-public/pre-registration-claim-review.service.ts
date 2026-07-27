import { Prisma } from '@prisma/client';
import {
  loadStudentIdentity,
  normalizeStudentEmail,
} from '../alunos/student-identity.service.js';
import { issue274Prisma as prisma } from '../pre-registration-enrollment/issue-274-prisma.js';
import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';
import { PreRegistrationPublicError } from './pre-registration-public.service.js';

type DetectionResult = Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>;
type EventMetadata = Record<string, unknown>;

type ClaimedProcessRow = {
  alunoId: string;
  contractId: string;
  userId: string | null;
  claimedByUserId: string | null;
  claimRole: string;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function metadataOf(value: Prisma.JsonValue | null): EventMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as EventMetadata;
}

function reviewFields(detection: DetectionResult): string[] {
  const fields = new Set<string>();
  for (const signal of detection.candidates.flatMap((candidate) => candidate.signals)) {
    if (signal.code === 'CPF_EXACT') fields.add('cpf');
    if (signal.code === 'EMAIL_EXACT') fields.add('email');
    if (signal.code === 'PHONE_EXACT') fields.add('phone');
    if (signal.code === 'NAME_AND_BIRTH_DATE') {
      fields.add('name');
      fields.add('birthDate');
    }
    if (signal.code === 'ACCOUNT_ALREADY_LINKED' || signal.code === 'ACCOUNT_INCOMPATIBLE') {
      fields.add('account');
    }
  }
  return [...fields].sort();
}

function reviewSections(fields: readonly string[]): string[] {
  return [
    ...(fields.some((field) => ['cpf', 'name', 'birthDate'].includes(field))
      ? ['identification']
      : []),
    ...(fields.some((field) => ['email', 'phone'].includes(field)) ? ['contact'] : []),
    ...(fields.includes('account') ? ['access'] : []),
  ];
}

async function claimedProcess(
  tx: Prisma.TransactionClient,
  userId: string,
  alunoId: string
): Promise<ClaimedProcessRow> {
  const rows = await tx.$queryRaw<ClaimedProcessRow[]>`
    SELECT student."id" AS "alunoId", student."contractId", student."userId",
           onboarding."claimedByUserId", onboarding."claimRole"
    FROM "Aluno" AS student
    JOIN "StudentOnboardingProcess" AS onboarding
      ON onboarding."alunoId" = student."id"
     AND onboarding."contractId" = student."contractId"
    WHERE student."id" = ${alunoId}
    FOR UPDATE OF student, onboarding
  `;
  const row = rows[0];
  if (
    !row ||
    row.claimedByUserId !== userId ||
    (row.claimRole === 'STUDENT' && row.userId !== userId) ||
    (row.claimRole !== 'STUDENT' && row.claimRole !== 'GUARDIAN')
  ) {
    throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
  }
  return row;
}

async function record(
  userId: string,
  alunoId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const process = await claimedProcess(tx, userId, alunoId);
    const detection = await detectPreRegistrationDuplicates(tx, {
      contractId: process.contractId,
      alunoId,
      overrides: process.claimRole === 'STUDENT' ? { userId } : {},
    });
    if (
      detection.classification !== 'REVIEW_REQUIRED' &&
      detection.classification !== 'BLOCKING'
    ) {
      return;
    }

    const fields = reviewFields(detection);
    const sections = reviewSections(fields);
    const identity = await loadStudentIdentity(alunoId, process.contractId, tx);
    const existing = await tx.studentProfileReview.findFirst({
      where: {
        alunoId,
        requestedByUserId: userId,
        status: 'pending',
        requiresApproval: true,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        changedFields: true,
        sectionsRequested: true,
      },
    });

    if (existing) {
      await tx.studentProfileReview.update({
        where: { id: existing.id },
        data: {
          requestedAt: new Date(),
          changedFields: asJson([
            ...new Set([...stringArray(existing.changedFields), ...fields]),
          ]),
          sectionsRequested: asJson([
            ...new Set([...stringArray(existing.sectionsRequested), ...sections]),
          ]),
          requiresApproval: true,
        },
      });
    } else {
      await tx.studentProfileReview.create({
        data: {
          alunoId,
          requestedByUserId: userId,
          sectionsRequested: asJson(sections),
          snapshotBefore: asJson(identity),
          snapshotAfter: asJson(identity),
          changedFields: asJson(fields),
          requiresApproval: true,
        },
      });
    }

    const priorEvents = await tx.studentLifecycleEvent.findMany({
      where: {
        alunoId,
        contractId: process.contractId,
        eventType: 'ADMIN_REVIEWED',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { metadata: true },
    });
    const alreadyAudited = priorEvents.some(({ metadata }) => {
      const value = metadataOf(metadata);
      return (
        value.source === 'public_pre_registration_claim' &&
        value.fingerprint === detection.fingerprint &&
        Number(value.reviewedRecordVersion) === detection.recordVersion
      );
    });
    if (!alreadyAudited) {
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId,
          contractId: process.contractId,
          eventType: 'ADMIN_REVIEWED',
          actorUserId: userId,
          metadata: {
            source: 'public_pre_registration_claim',
            action: 'duplicate_review_requested',
            classification: detection.classification,
            fields,
            signalCodes: [
              ...new Set(
                detection.candidates.flatMap((candidate) =>
                  candidate.signals.map((signal) => signal.code)
                )
              ),
            ],
            fingerprint: detection.fingerprint,
            reviewedRecordVersion: detection.recordVersion,
            publicDisclosure: 'NONE',
          },
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const preRegistrationClaimReviewService = {
  record,

  async recordByEmail(email: string, alunoId: string): Promise<void> {
    const normalized = normalizeStudentEmail(email);
    const user = normalized
      ? await prisma.user.findFirst({
          where: { email: { equals: normalized, mode: 'insensitive' } },
          select: { id: true },
        })
      : null;
    if (!user) {
      throw new PreRegistrationPublicError('Cadastro não encontrado.', 'NOT_FOUND');
    }
    await record(user.id, alunoId);
  },
};
