import { sanitizeProntuarioOverviewForSummary } from '../src/modules/prontuario/prontuario-parq-boundary';

const baseSubmission = {
  id: 'submission-latest',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  catalogVersion: 'parq-2026-01' as const,
  submittedAt: '2026-07-26T10:00:00.000Z',
  responses: {
    q1: false,
    q2: true,
    q3: false,
    q4: false,
    q5: false,
    q6: false,
    q7: false,
  },
  positiveItems: [{ key: 'q2' as const, label: 'Resposta clínica discriminante' }],
  positiveCount: 1,
  declarationAccepted: true as const,
  sourceType: 'student' as const,
  review: {
    id: 'review-latest',
    status: 'REVIEWED' as const,
    reviewedAt: '2026-07-26T11:00:00.000Z',
    reviewNotes: 'Observação clínica que não pode sair no resumo',
  },
};

describe('PRNT PAR-Q summary boundary', () => {
  it('drops clinical answers, positive items and review notes from the generic overview', () => {
    const result = sanitizeProntuarioOverviewForSummary({
      records: [],
      currentRecord: null,
      latestParqSubmission: baseSubmission,
      parqSubmissions: [
        baseSubmission,
        {
          ...baseSubmission,
          id: 'submission-pending-old',
          submittedAt: '2026-07-25T10:00:00.000Z',
          review: { id: 'review-pending-old', status: 'PENDING' as const },
        },
      ],
      parqState: 'COMPLETED_REVIEW_REQUIRED',
      parqLegacy: { preserved: true, needsRepeat: false },
    });

    expect(result.parq).toEqual({
      state: 'COMPLETED_REVIEW_REQUIRED',
      latestSubmission: {
        id: 'submission-latest',
        catalogVersion: 'parq-2026-01',
        submittedAt: '2026-07-26T10:00:00.000Z',
        positiveCount: 1,
        review: { status: 'REVIEWED' },
      },
      requiresProfessionalReview: true,
      legacy: { preserved: true, needsRepeat: false },
    });

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'responses',
      'positiveItems',
      'reviewNotes',
      'Resposta clínica discriminante',
      'Observação clínica que não pode sair no resumo',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
