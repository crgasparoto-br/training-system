import { Prisma } from '@prisma/client';
import { loadStudentIdentity } from '../alunos/student-identity.service.js';
import { detectPreRegistrationDuplicates } from '../pre-registration-enrollment/pre-registration-enrollment.service.js';

type DetectionResult = Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>;
type EventMetadata = Record<string, unknown>;

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

export async function recordClaimDuplicateReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    alunoId: string;
    contractId: string;
    detection: DetectionResult;
  }
): Promise<void> {
  const { userId, alunoId, contractId, detection } = input;
  if (
    detection.classification !== 'REVIEW_REQUIRED' &&
    detection.classification !== 'BLOCKING'
  ) {
    return;
  }

  const fields = reviewFields(detection);
  const sections = reviewSections(fields);
  const identity = await loadStudentIdentity(alunoId, contractId, tx);
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
    where: { alunoId, contractId, eventType: 'ADMIN_REVIEWED' },
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
  if (alreadyAudited) return;

  await tx.studentLifecycleEvent.create({
    data: {
      alunoId,
      contractId,
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
