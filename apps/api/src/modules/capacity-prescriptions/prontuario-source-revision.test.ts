import { ProntuarioSourceRevisionError, resolveProntuarioSourceRevision, revisionDate, revisionText } from './prontuario-source-revision.js';

const client = () => ({
  prontuarioHistoryEvent: { findFirst: jest.fn() },
}) as any;

describe('PRNT canonical prescription revision', () => {
  it('resolves legacy timestamps to the latest scoped immutable event', async () => {
    const db = client();
    db.prontuarioHistoryEvent.findFirst.mockResolvedValue({ version: 3, snapshot: { title: 'Histórico verdadeiro' } });
    const result = await resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', '2026-10-13T00:00:00.000Z');
    expect(result).toEqual({ version: 3, snapshot: { title: 'Histórico verdadeiro' } });
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledWith({
      where: { contractId: 'contract-a', alunoId: 'aluno-a', entityType: 'goal', entityId: 'goal-a' },
      orderBy: { version: 'desc' }, select: { version: true, snapshot: true },
    });
  });

  it('pins a historical version without silently upgrading it to the newest clinical state', async () => {
    const db = client();
    db.prontuarioHistoryEvent.findFirst.mockResolvedValue({ version: 1, snapshot: { title: 'Antigo' } });
    await expect(resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', 1))
      .resolves.toEqual({ version: 1, snapshot: { title: 'Antigo' } });
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ version: 1, contractId: 'contract-a', alunoId: 'aluno-a' }),
    }));
    expect(revisionText({ title: 'Antigo' }, 'title', 'Novo')).toBe('Antigo');
  });

  it('pins stringified numeric versions as exact revisions, never as legacy hints', async () => {
    const db = client();
    db.prontuarioHistoryEvent.findFirst.mockResolvedValue({ version: 1, snapshot: { title: 'Primeira versão' } });
    await expect(resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', '1'))
      .resolves.toEqual({ version: 1, snapshot: { title: 'Primeira versão' } });
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: 'contract-a', alunoId: 'aluno-a', entityType: 'goal', entityId: 'goal-a', version: 1 },
    }));
  });

  it('rejects nonexistent or invalid numeric strings without falling back to latest', async () => {
    const db = client();
    db.prontuarioHistoryEvent.findFirst.mockResolvedValue(null);
    await expect(resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', '999'))
      .rejects.toBeInstanceOf(ProntuarioSourceRevisionError);
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entityId: 'goal-a', version: 999 }),
    }));
    for (const invalid of ['0', '-1', '1.5', '9007199254740992']) {
      await expect(resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', invalid))
        .rejects.toBeInstanceOf(ProntuarioSourceRevisionError);
    }
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or foreign-tenant revisions and invalid numerical versions', async () => {
    const db = client();
    db.prontuarioHistoryEvent.findFirst.mockResolvedValue(null);
    await expect(resolveProntuarioSourceRevision(db, 'contract-b', 'aluno-b', 'medicationProcedure', 'med-a', 2))
      .rejects.toBeInstanceOf(ProntuarioSourceRevisionError);
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: 'contract-b', alunoId: 'aluno-b', entityType: 'medicationProcedure', entityId: 'med-a', version: 2 },
    }));
    await expect(resolveProntuarioSourceRevision(db, 'contract-a', 'aluno-a', 'goal', 'goal-a', 0))
      .rejects.toBeInstanceOf(ProntuarioSourceRevisionError);
    expect(db.prontuarioHistoryEvent.findFirst).toHaveBeenCalledTimes(1);
  });

  it('reconstructs the historical assessment date instead of showing the latest one', () => {
    expect(revisionDate({ onsetDate: '2026-07-12T10:00:00.000Z' }, 'onsetDate', new Date('2026-10-13T10:00:00Z')))
      .toBe('2026-07-12T10:00:00.000Z');
    // No historical clinical start date: fall back to immutable creation time,
    // never to a later mutable onsetDate/startDate from the current record.
    expect(revisionDate({ onsetDate: null }, 'onsetDate', new Date('2026-07-01T10:00:00Z')))
      .toBe('2026-07-01T10:00:00.000Z');
  });
});
