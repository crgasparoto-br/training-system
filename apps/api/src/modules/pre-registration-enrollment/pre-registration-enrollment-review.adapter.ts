import type { PreRegistrationEnrollmentReviewDTO } from '@corrida/types';
import { issue274Prisma as prisma } from './issue-274-prisma.js';
import {
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';
import { preRegistrationReadyReviewService } from './pre-registration-ready-review.service.js';

type RuntimeService = typeof preRegistrationEnrollmentService & {
  __issue274EnrollmentReviewAdapterApplied?: boolean;
};

function reviewIsResolved(review: PreRegistrationEnrollmentReviewDTO): boolean {
  if (review.classification === 'NONE' || review.classification === 'INFORMATIONAL') return true;
  if (review.classification === 'BLOCKING') return false;
  return review.currentDecision?.action === 'CONFIRM_DIFFERENT';
}

async function hasCurrentEnrollmentReview(
  actor: PreRegistrationEnrollmentActor,
  review: PreRegistrationEnrollmentReviewDTO
): Promise<boolean> {
  if (review.status !== 'READY_FOR_ENROLLMENT') return false;
  const [onboarding, events] = await Promise.all([
    prisma.studentOnboardingProcess.findFirst({
      where: { alunoId: review.alunoId, contractId: actor.contractId },
      select: { reviewedAt: true },
    }),
    prisma.studentLifecycleEvent.findMany({
      where: {
        alunoId: review.alunoId,
        contractId: actor.contractId,
        eventType: 'ADMIN_REVIEWED',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { metadata: true },
    }),
  ]);
  if (!onboarding?.reviewedAt) return false;
  return events.some(({ metadata }) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
    const value = metadata as Record<string, unknown>;
    return (
      value.kind === 'ENROLLMENT_REVIEW' &&
      value.fingerprint === review.fingerprint &&
      Number(value.reviewedRecordVersion) === review.recordVersion
    );
  });
}

const runtime = preRegistrationEnrollmentService as RuntimeService;
if (!runtime.__issue274EnrollmentReviewAdapterApplied) {
  const inspectOriginal = runtime.inspect.bind(runtime);
  const markReadyOriginal = runtime.markReady.bind(runtime);

  runtime.inspect = async (actor, alunoId) => {
    const review = await inspectOriginal(actor, alunoId);
    if (review.status !== 'READY_FOR_ENROLLMENT') return review;

    const current = await hasCurrentEnrollmentReview(actor, review);
    const resolved = reviewIsResolved(review);
    return {
      ...review,
      canMarkReady: resolved && !current,
      canConfirmEnrollment: review.canConfirmEnrollment && current,
    };
  };

  runtime.markReady = async (actor, alunoId, input) => {
    const review = await runtime.inspect(actor, alunoId);
    if (review.status !== 'READY_FOR_ENROLLMENT') {
      return markReadyOriginal(actor, alunoId, input);
    }
    if (!review.canMarkReady) {
      return review;
    }
    await preRegistrationReadyReviewService.refresh(actor, alunoId, input);
    return runtime.inspect(actor, alunoId);
  };

  runtime.__issue274EnrollmentReviewAdapterApplied = true;
}
