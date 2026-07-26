import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { prontuarioService } from './prontuario.service';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(api.get);
const postMock = vi.mocked(api.post);

function apiResponse<T>(data: T) {
  return { data: { success: true, data } } as any;
}

const summary = {
  records: [],
  currentRecord: null,
  parq: {
    state: 'COMPLETED_REVIEW_REQUIRED',
    latestSubmission: {
      id: 'submission-1',
      catalogVersion: 'parq-2026-01',
      submittedAt: '2026-07-26T10:00:00.000Z',
      positiveCount: 1,
      review: { status: 'PENDING' },
    },
    requiresProfessionalReview: true,
    legacy: { preserved: false, needsRepeat: false },
  },
} as const;

const detailedSubmission = {
  id: 'submission-1',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  catalogVersion: 'parq-2026-01',
  submittedAt: '2026-07-26T10:00:00.000Z',
  responses: { q1: false, q2: true, q3: false, q4: false, q5: false, q6: false, q7: false },
  positiveItems: [{ key: 'q2', label: 'Resposta clínica protegida' }],
  positiveCount: 1,
  declarationAccepted: true,
  sourceType: 'student',
  review: { id: 'review-1', status: 'PENDING' },
} as const;

describe('prontuarioService PAR-Q access split', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('merges protected PAR-Q history only from the dedicated endpoint', async () => {
    getMock
      .mockResolvedValueOnce(apiResponse(summary))
      .mockResolvedValueOnce(apiResponse([detailedSubmission]));

    await expect(prontuarioService.overview('aluno-1')).resolves.toMatchObject({
      parq: summary.parq,
      latestParqSubmission: detailedSubmission,
      parqSubmissions: [detailedSubmission],
    });

    expect(getMock).toHaveBeenNthCalledWith(1, '/prontuario/alunos/aluno-1');
    expect(getMock).toHaveBeenNthCalledWith(2, '/prontuario/alunos/aluno-1/parq-submissions');
  });

  it('keeps the generic overview usable when the detailed block is forbidden', async () => {
    getMock
      .mockResolvedValueOnce(apiResponse(summary))
      .mockRejectedValueOnce({ response: { status: 403 } });

    await expect(prontuarioService.overview('aluno-1')).resolves.toEqual({
      ...summary,
      latestParqSubmission: null,
      parqSubmissions: [],
    });
  });

  it('does not hide failures other than an authoritative permission denial', async () => {
    getMock
      .mockResolvedValueOnce(apiResponse(summary))
      .mockRejectedValueOnce({ response: { status: 500 }, message: 'backend unavailable' });

    await expect(prontuarioService.overview('aluno-1')).rejects.toMatchObject({
      response: { status: 500 },
    });
  });

  it('reloads the split overview after a professional review', async () => {
    postMock.mockResolvedValueOnce(apiResponse({}));
    getMock
      .mockResolvedValueOnce(apiResponse(summary))
      .mockResolvedValueOnce(apiResponse([detailedSubmission]));

    await expect(
      prontuarioService.reviewParq('aluno-1', 'review-1', 'Analisado')
    ).resolves.toMatchObject({ parqSubmissions: [detailedSubmission] });

    expect(postMock).toHaveBeenCalledWith(
      '/prontuario/alunos/aluno-1/parq-reviews/review-1/review',
      { reviewNotes: 'Analisado' }
    );
  });
});
