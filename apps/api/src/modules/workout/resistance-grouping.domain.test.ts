import {
  deriveResistanceGroupAssignments,
  type ResistanceGroupDeclaration,
} from './resistance-grouping.domain.js';

const sets = (count: number) => [{
  plannedSets: Array.from({ length: count }, (_, index) => ({ id: `set-${index + 1}` })),
}];

const row = (id: string, order: number, overrides: Record<string, unknown> = {}) => ({
  id,
  section: 'sessao',
  exerciseOrder: order,
  groupBreakBefore: false,
  groupId: null,
  groupType: null,
  groupPosition: null,
  groupRounds: null,
  resistanceBlocks: sets(3),
  ...overrides,
});

describe('issue #400 - agrupamento resistido canônico', () => {
  it('persiste identidade, ordem e rodadas para bi-set', () => {
    const rows = [row('a', 1), row('b', 2)];
    const declarations = new Map<string, ResistanceGroupDeclaration>([['a', 'biset'], ['b', 'biset']]);
    const result = deriveResistanceGroupAssignments(rows as never, declarations);
    expect(result[0]).toMatchObject({ groupType: 'biset', groupPosition: 1, groupRounds: 3 });
    expect(result[1]).toMatchObject({ groupType: 'biset', groupPosition: 2, groupRounds: 3 });
    expect(result[0].groupId).toBeTruthy();
    expect(result[1].groupId).toBe(result[0].groupId);
  });

  it('separa circuitos apenas por fronteira explícita', () => {
    const rows = [
      row('a', 1), row('b', 2),
      row('c', 3, { groupBreakBefore: true }), row('d', 4),
    ];
    const declarations = new Map<string, ResistanceGroupDeclaration>(
      rows.map((item) => [item.id, 'circuit']),
    );
    const result = deriveResistanceGroupAssignments(rows as never, declarations);
    expect(result[0].groupId).toBe(result[1].groupId);
    expect(result[2].groupId).toBe(result[3].groupId);
    expect(result[2].groupId).not.toBe(result[0].groupId);
  });

  it('rejeita agrupamento incompleto ou participantes com rodadas divergentes', () => {
    expect(() => deriveResistanceGroupAssignments(
      [row('a', 1)] as never,
      new Map([['a', 'biset' as const]]),
    )).toThrow(/incompleto/);
    expect(() => deriveResistanceGroupAssignments(
      [row('a', 1), row('b', 2, { resistanceBlocks: sets(2) })] as never,
      new Map([['a', 'biset' as const], ['b', 'biset' as const]]),
    )).toThrow(/mesma quantidade/);
  });

  it('preserva declaração omitida e remove o grupo somente com null explícito', () => {
    const existing = [
      row('a', 1, { groupId: 'stable', groupType: 'biset', groupPosition: 1, groupRounds: 3 }),
      row('b', 2, { groupId: 'stable', groupType: 'biset', groupPosition: 2, groupRounds: 3 }),
    ];
    const omitted = deriveResistanceGroupAssignments(
      existing as never,
      new Map<string, ResistanceGroupDeclaration>([['a', undefined], ['b', undefined]]),
    );
    expect(omitted.map((item) => item.groupId)).toEqual(['stable', 'stable']);

    const removed = deriveResistanceGroupAssignments(
      existing as never,
      new Map<string, ResistanceGroupDeclaration>([['a', null], ['b', null]]),
    );
    expect(removed).toEqual([
      expect.objectContaining({ groupId: null, groupType: null, groupPosition: null, groupRounds: null }),
      expect.objectContaining({ groupId: null, groupType: null, groupPosition: null, groupRounds: null }),
    ]);
  });

  it('preserva o groupId quando membros, ordem e rodadas não mudam', () => {
    const existing = [
      row('a', 1, { groupId: 'stable', groupType: 'biset', groupPosition: 1, groupRounds: 3 }),
      row('b', 2, { groupId: 'stable', groupType: 'biset', groupPosition: 2, groupRounds: 3 }),
    ];
    const result = deriveResistanceGroupAssignments(existing as never);
    expect(result.map((item) => item.groupId)).toEqual(['stable', 'stable']);
  });
});
