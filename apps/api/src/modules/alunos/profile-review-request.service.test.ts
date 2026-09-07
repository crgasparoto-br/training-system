import { createOrReusePendingProfileReview } from './profile-review-request.service.js';

const review = {
  id: 'review-existing',
  alunoId: 'aluno-1',
  status: 'pending',
  requestedAt: new Date('2026-08-15T12:00:00Z'),
};

const input = {
  alunoId: 'aluno-1',
  requestedByUserId: 'prof-1',
  dueAt: new Date('2026-08-20T12:00:00Z'),
  sectionsRequested: ['personal'],
  snapshotBefore: { profile: { name: 'Aluno' } },
} as any;

describe('createOrReusePendingProfileReview', () => {
  it('reutiliza a revisão pendente e não cria duplicata', async () => {
    const tx = {
      studentProfileReview: {
        findFirst: jest.fn().mockResolvedValue(review),
        create: jest.fn(),
      },
    };
    const client = {
      studentProfileReview: tx.studentProfileReview,
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any;

    const result = await createOrReusePendingProfileReview(client, input);

    expect(result).toEqual({ review, reviewCreated: false });
    expect(tx.studentProfileReview.create).not.toHaveBeenCalled();
  });

  it('cria uma revisão quando não existe pendência', async () => {
    const created = { ...review, id: 'review-new' };
    const tx = {
      studentProfileReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const client = {
      studentProfileReview: tx.studentProfileReview,
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any;

    const result = await createOrReusePendingProfileReview(client, input);

    expect(result).toEqual({ review: created, reviewCreated: true });
    expect(tx.studentProfileReview.create).toHaveBeenCalledTimes(1);
  });

  it('em conflito serializável reutiliza a pendência criada pela chamada concorrente', async () => {
    const client = {
      studentProfileReview: {
        findFirst: jest.fn().mockResolvedValue(review),
      },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as any;

    const result = await createOrReusePendingProfileReview(client, input);

    expect(result).toEqual({ review, reviewCreated: false });
    expect(client.studentProfileReview.findFirst).toHaveBeenCalledTimes(1);
  });
});
