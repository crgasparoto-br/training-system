import { appendProntuarioHistory, assertKnownProntuarioItem } from './prontuario-history.service.js';

const record = { id: 'record-1', contractId: 'contract-1', alunoId: 'aluno-1' };

function makeTx(version: number | null) {
  return {
    prontuarioHistoryEvent: {
      findFirst: jest.fn().mockResolvedValue(version === null ? null : { version }),
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  } as any;
}

describe('appendProntuarioHistory', () => {
  it('creates an authored first version scoped to contract and student', async () => {
    const tx = makeTx(null);
    const changed = await appendProntuarioHistory(
      tx, record, 'goal', 'goal-1', null,
      { status: 'active', title: 'Correr 5 km' }, 'actor-1'
    );
    expect(changed).toBe(true);
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: 'record-1', contractId: 'contract-1', alunoId: 'aluno-1',
        entityType: 'goal', entityId: 'goal-1', version: 1, action: 'created',
        actorUserId: 'actor-1', source: 'prnt-api',
      }),
    });
  });

  it('does not emit a new event for semantically unchanged state', async () => {
    const tx = makeTx(2);
    const changed = await appendProntuarioHistory(
      tx, record, 'goal', 'goal-1', { status: 'active', title: 'A' },
      { title: 'A', status: 'active' }, 'actor-2'
    );
    expect(changed).toBe(false);
    expect(tx.prontuarioHistoryEvent.findFirst).not.toHaveBeenCalled();
    expect(tx.prontuarioHistoryEvent.create).not.toHaveBeenCalled();
  });

  it('preserves a baseline before a legacy record is closed', async () => {
    const tx = makeTx(null);
    await appendProntuarioHistory(
      tx, record, 'goal', 'goal-legacy', { status: 'active' },
      { status: 'resolved' }, 'actor-2'
    );
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        version: 1, action: 'baseline', source: 'legacy-baseline', actorUserId: null,
      }),
    });
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        version: 2, action: 'closed', source: 'prnt-api', actorUserId: 'actor-2',
      }),
    });
  });

  it('records edits to a resolved goal as updates instead of repeating the closure', async () => {
    const tx = makeTx(2);
    await appendProntuarioHistory(
      tx, record, 'goal', 'goal-1',
      { status: 'resolved', title: 'Correr 5 km', closedAt: new Date('2026-10-11T10:00:00Z') },
      { status: 'resolved', title: 'Correr 10 km', closedAt: new Date('2026-10-11T10:00:00Z') },
      'actor-2'
    );
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'goal', version: 3, action: 'updated',
        actorUserId: 'actor-2', snapshot: expect.objectContaining({ title: 'Correr 10 km' }),
      }),
    });
  });

  it('does not treat changes between terminal states or reopening as new closures', async () => {
    const cases = [
      { before: { status: 'resolved', title: 'A' }, after: { status: 'archived', title: 'A' } },
      { before: { status: 'archived', title: 'A' }, after: { status: 'active', title: 'Reaberto' } },
      { before: { status: 'closed', notes: 'A' }, after: { status: 'closed', notes: 'B' } },
    ];
    for (const [index, item] of cases.entries()) {
      const tx = makeTx(3);
      await appendProntuarioHistory(tx, record, 'record', `record-${index}`,
        item.before, item.after, 'actor-3');
      expect(tx.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ version: 4, action: 'updated' }),
      });
    }
  });

  it('emits a closure only on a real transition to a terminal status', async () => {
    const tx = makeTx(1);
    await appendProntuarioHistory(
      tx, record, 'goal', 'goal-2',
      { status: 'active', title: 'Meta' },
      { status: 'resolved', title: 'Meta' }, 'actor-2'
    );
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 2, action: 'closed' }),
    });
  });

  it('distinguishes first and later medication end-date changes', async () => {
    const closed = makeTx(1);
    const endDate = new Date('2026-10-12T10:00:00Z');
    await appendProntuarioHistory(
      closed, record, 'medicationProcedure', 'med-1',
      { endDate: null, notes: 'A' }, { endDate, notes: 'A' }, 'actor-2'
    );
    expect(closed.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'closed' }),
    });

    const edited = makeTx(2);
    await appendProntuarioHistory(
      edited, record, 'medicationProcedure', 'med-1',
      { endDate, notes: 'A' }, { endDate, notes: 'B' }, 'actor-3'
    );
    expect(edited.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 3, action: 'updated' }),
    });
  });

  it('classifies the first endedAt on activity history as closure, subsequent edits as updates', async () => {
    const endedAt = new Date('2026-10-13T12:00:00Z');
    const closed = makeTx(1);
    await appendProntuarioHistory(closed, record, 'activityHistory', 'activity-1',
      { description: 'Corrida', endedAt: null },
      { description: 'Corrida', endedAt }, 'actor-1');
    expect(closed.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'closed', version: 2 }),
    });

    const edited = makeTx(2);
    await appendProntuarioHistory(edited, record, 'activityHistory', 'activity-1',
      { description: 'Corrida', endedAt },
      { description: 'Corrida leve', endedAt }, 'actor-2');
    expect(edited.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'updated', version: 3 }),
    });

    const reopened = makeTx(3);
    await appendProntuarioHistory(reopened, record, 'activityHistory', 'activity-1',
      { description: 'Corrida leve', endedAt },
      { description: 'Corrida leve', endedAt: null }, 'actor-3');
    expect(reopened.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'updated', version: 4 }),
    });
  });

  it('recognizes first-time closedAt without repeating closure on later edits', async () => {
    const date = new Date('2026-10-12T10:00:00Z');
    const first = makeTx(1);
    await appendProntuarioHistory(
      first, record, 'goal', 'goal-3',
      { status: 'resolved', title: 'A', closedAt: null },
      { status: 'resolved', title: 'A', closedAt: date }, 'actor-2'
    );
    expect(first.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'closed' }),
    });

    const next = makeTx(2);
    await appendProntuarioHistory(
      next, record, 'goal', 'goal-3',
      { status: 'resolved', title: 'A', closedAt: date },
      { status: 'resolved', title: 'B', closedAt: date }, 'actor-3'
    );
    expect(next.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'updated' }),
    });
  });

  it('classifies a newly created already-closed item as creation, not closure', async () => {
    const tx = makeTx(null);
    await appendProntuarioHistory(
      tx, record, 'goal', 'goal-4', null,
      { status: 'resolved', title: 'Já concluída', closedAt: new Date('2026-10-12T10:00:00Z') },
      'actor-1'
    );
    expect(tx.prontuarioHistoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 1, action: 'created' }),
    });
  });

  it('rejects foreign item IDs instead of duplicating them', () => {
    expect(() => assertKnownProntuarioItem('foreign-item', false))
      .toThrow('Registro clínico não encontrado no contrato');
    expect(() => assertKnownProntuarioItem(undefined, false)).not.toThrow();
  });
});
