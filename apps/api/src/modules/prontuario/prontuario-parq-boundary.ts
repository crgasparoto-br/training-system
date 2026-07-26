import type {
  ParqAdministrativeSummaryDTO,
  ParqSubmissionDTO,
} from '@corrida/types';

type DetailedProntuarioOverview<TRecord> = {
  records: TRecord[];
  currentRecord: TRecord | null;
  latestParqSubmission: ParqSubmissionDTO | null;
  parqSubmissions: ParqSubmissionDTO[];
  parqState: ParqAdministrativeSummaryDTO['state'];
  parqLegacy: ParqAdministrativeSummaryDTO['legacy'];
};

type ProntuarioOverviewSummaryPayload<TRecord> = {
  records: TRecord[];
  currentRecord: TRecord | null;
  parq: ParqAdministrativeSummaryDTO;
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
 * history before serialization under the summary block permission while
 * preserving the service's native record date types until Express serializes
 * the payload.
 */
export function sanitizeProntuarioOverviewForSummary<TRecord>(
  overview: DetailedProntuarioOverview<TRecord>
): ProntuarioOverviewSummaryPayload<TRecord> {
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
