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

  it('rejects foreign item IDs instead of duplicating them', () => {
    expect(() => assertKnownProntuarioItem('foreign-item', false))
      .toThrow('Registro clínico não encontrado no contrato');
    expect(() => assertKnownProntuarioItem(undefined, false)).not.toThrow();
  });
});
