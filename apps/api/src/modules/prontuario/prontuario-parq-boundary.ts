import type {
  ParqAdministrativeSummaryDTO,
  ParqSubmissionDTO,
  ProntuarioOverviewSummary,
  ProntuarioRecord,
} from '@corrida/types';

type DetailedProntuarioOverview = {
  records: ProntuarioRecord[];
  currentRecord: ProntuarioRecord | null;
  latestParqSubmission: ParqSubmissionDTO | null;
  parqSubmissions: ParqSubmissionDTO[];
  parqState: ParqAdministrativeSummaryDTO['state'];
  parqLegacy: ParqAdministrativeSummaryDTO['legacy'];
};

function summarizeSubmission(
  submission: ParqSubmissionDTO | null
): ParqAdministrativeSummaryDTO['latestSubmission'] {
  if (!submission) return null;

  return {
    id: submission.id,
    catalogVersion: submission.catalogVersion,
    submittedAt: submission.submittedAt,
    positiveCount: submission.positiveCount,
    review: submission.review ? { status: submission.review.status } : undefined,
  };
}

/**
 * Public response boundary for the generic PRNT overview.
 *
 * The underlying legacy service still assembles the complete clinical PAR-Q
 * history for authenticated health flows. This mapper deliberately drops that
 * history before serialization under the summary block permission.
 */
export function sanitizeProntuarioOverviewForSummary(
  overview: DetailedProntuarioOverview
): ProntuarioOverviewSummary {
  return {
    records: overview.records,
    currentRecord: overview.currentRecord,
    parq: {
      state: overview.parqState,
      latestSubmission: summarizeSubmission(overview.latestParqSubmission),
      requiresProfessionalReview: overview.parqSubmissions.some(
        (submission) => submission.review?.status === 'PENDING'
      ),
      legacy: overview.parqLegacy,
    },
  };
}
