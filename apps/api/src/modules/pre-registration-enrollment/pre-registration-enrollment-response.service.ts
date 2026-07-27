import type {
  PreRegistrationDuplicateDecisionInputDTO,
  PreRegistrationEnrollmentReviewDTO,
  PreRegistrationLeadDuplicateCheckDTO,
} from '@corrida/types';
import {
  visiblePreRegistrationCandidateIds,
} from './pre-registration-enrollment-access.service.js';
import {
  detectPreRegistrationDuplicates,
  PreRegistrationEnrollmentError,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';

type DetectionResult = Awaited<ReturnType<typeof detectPreRegistrationDuplicates>>;

function publicCandidate(candidate: DetectionResult['candidates'][number]) {
  return {
    candidateAlunoId: candidate.candidateAlunoId,
    maskedName: candidate.maskedName,
    status: candidate.status,
    classification: candidate.classification,
    signals: candidate.signals,
    differences: candidate.differences,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export async function projectScopedLeadDuplicateCheck(
  actor: PreRegistrationEnrollmentActor,
  detection: DetectionResult
): Promise<PreRegistrationLeadDuplicateCheckDTO> {
  const visibleIds = await visiblePreRegistrationCandidateIds(
    actor,
    detection.candidates.map((candidate) => candidate.candidateAlunoId)
  );
  const candidates = detection.candidates
    .filter((candidate) => visibleIds.has(candidate.candidateAlunoId))
    .map(publicCandidate);
  return {
    recordVersion: detection.recordVersion,
    fingerprint: detection.fingerprint,
    classification: detection.classification,
    candidates,
    restrictedCandidateCount: detection.candidates.length - candidates.length,
    hasBlockingCpfConflict: detection.candidates.some((candidate) =>
      candidate.signals.some((signal) => signal.code === 'CPF_EXACT')
    ),
  };
}

export async function projectScopedEnrollmentReview(
  actor: PreRegistrationEnrollmentActor,
  review: PreRegistrationEnrollmentReviewDTO
): Promise<PreRegistrationEnrollmentReviewDTO> {
  const visibleIds = await visiblePreRegistrationCandidateIds(
    actor,
    review.candidates.map((candidate) => candidate.candidateAlunoId)
  );
  const candidates = review.candidates.filter((candidate) =>
    visibleIds.has(candidate.candidateAlunoId)
  );
  const restrictedCandidateCount = review.candidates.length - candidates.length;
  return {
    ...review,
    candidates,
    restrictedCandidateCount,
    canConfirmDifferentPeople:
      review.canConfirmDifferentPeople && restrictedCandidateCount === 0,
    canUseExistingCanonical: review.canUseExistingCanonical && candidates.length > 0,
  };
}

export async function assertDuplicateDecisionScope(
  actor: PreRegistrationEnrollmentActor,
  review: PreRegistrationEnrollmentReviewDTO,
  input: PreRegistrationDuplicateDecisionInputDTO
): Promise<void> {
  if (input.action === 'CANCEL') return;
  const visibleIds = await visiblePreRegistrationCandidateIds(
    actor,
    review.candidates.map((candidate) => candidate.candidateAlunoId)
  );
  if (input.action === 'USE_EXISTING_CANONICAL') {
    if (!input.candidateAlunoId || !visibleIds.has(input.candidateAlunoId)) {
      throw new PreRegistrationEnrollmentError('Recurso não encontrado.', 'NOT_FOUND');
    }
    return;
  }
  if (visibleIds.size !== review.candidates.length) {
    throw new PreRegistrationEnrollmentError(
      'Esta decisão exige um usuário com escopo para revisar todos os cadastros relacionados.',
      'FORBIDDEN'
    );
  }
}
