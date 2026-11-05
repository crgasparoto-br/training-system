import {
  ACTIVE_COMBINED_CONFLICT_RULES_V1,
  COMBINED_CONFLICT_PROTOCOL_VERSION,
  ConflictProtocolInputError,
  evaluateCombinedTrainingConflicts,
  type ConflictEvaluationInput,
  type ConflictRule,
  type ConflictObservation,
} from './combined-training-conflicts.domain.js';

const source = (recordId: string) => ({ kind: 'consolidated_release' as const, recordId, version: 'v1' });
const release = (recordId: string, value: number) => ({ value, source: source(recordId) });
const observation = (patch: Partial<ConflictObservation> = {}): ConflictObservation => ({
  alunoId: 'aluno-1', contractId: 'contract-1', sessionId: 'run-1',
  capacity: 'cyclic', scheduledAt: '2026-11-02T09:00:00.000Z',
  numeric: { cyclicZone: release('release-run', 5) },
  ...patch,
});
const activeRule = (): ConflictRule => ({
  code: 'INTENSE_CYCLIC_THEN_RESISTED_V1_TEST',
  version: '1.0.0',
  sourceDocument: 'test-fixture-only:not-a-production-clinical-approval',
  status: 'active',
  severity: 'warning',
  professorGuidance: 'Revisar a sequência e evidências do aluno.',
  approval: { professionalId: 'test-professional', credential: 'TEST-ONLY', approvedAt: '2026-11-01T12:00:00.000Z' },
  expression: {
    kind: 'sequence',
    first: { capacity: 'cyclic', conditions: [{ kind: 'numeric', metric: 'cyclicZone', op: 'gte', value: 4 }] },
    then: { capacity: 'resisted', conditions: [{ kind: 'numeric', metric: 'strengthPercent1Rm', op: 'gte', value: 80 }] },
    minHours: 0,
    maxHours: 24,
  },
});
const inputs = (overrides: Partial<ConflictEvaluationInput> = {}): ConflictEvaluationInput => ({
  alunoId: 'aluno-1', contractId: 'contract-1',
  windowStart: '2026-11-02T00:00:00.000Z',
  windowEnd: '2026-11-09T00:00:00.000Z',
  coverage: 'complete',
  observations: [
    observation(),
    observation({
      sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-03T08:00:00.000Z',
      numeric: { strengthPercent1Rm: release('release-resisted', 85) },
    }),
  ],
  rules: [activeRule()],
  ...overrides,
});

describe('issue #403: protocol v1 governance and fail-closed domain engine', () => {
  it('does not activate a proposed clinical rule in production', () => {
    expect(ACTIVE_COMBINED_CONFLICT_RULES_V1).toEqual([]);
    expect(evaluateCombinedTrainingConflicts(inputs({ rules: ACTIVE_COMBINED_CONFLICT_RULES_V1 }))).toEqual({
      protocolVersion: COMBINED_CONFLICT_PROTOCOL_VERSION,
      state: 'no_active_rules', evaluations: [], changesWorkoutAutomatically: false,
    });
  });

  it('finds a discriminant cross-capacity sequence with exact source/release and severity', () => {
    const { evaluations } = evaluateCombinedTrainingConflicts(inputs());
    expect(evaluations[0]).toMatchObject({
      status: 'triggered', severity: 'warning', ruleVersion: '1.0.0',
      ruleSource: 'test-fixture-only:not-a-production-clinical-approval',
      changesWorkoutAutomatically: false,
    });
    expect(evaluations[0].evidence.map((item) => [item.capacity, item.source.recordId, item.value])).toEqual([
      ['cyclic', 'release-run', 5], ['resisted', 'release-resisted', 85],
    ]);
  });

  it('does not flag intensity below the versioned limit', () => {
    const result = evaluateCombinedTrainingConflicts(inputs({
      observations: [observation(), observation({
        sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-03T08:00:00.000Z',
        numeric: { strengthPercent1Rm: release('release-resisted', 79) },
      })],
    }));
    expect(result.evaluations[0].status).toBe('not_triggered');
  });

  it('respects the temporal window and order, without interpreting a shared session as consecutive', () => {
    const far = inputs({ observations: [
      observation(),
      observation({ sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-04T08:00:00.000Z',
        numeric: { strengthPercent1Rm: release('release-resisted', 85) } }),
    ] });
    expect(evaluateCombinedTrainingConflicts(far).evaluations[0].status).toBe('not_triggered');
    const reversed = inputs({ observations: [
      observation({ scheduledAt: '2026-11-04T09:00:00.000Z' }),
      observation({ sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-03T08:00:00.000Z',
        numeric: { strengthPercent1Rm: release('release-resisted', 85) } }),
    ] });
    expect(evaluateCombinedTrainingConflicts(reversed).evaluations[0].status).toBe('not_triggered');
  });

  it('does not infer from free text or missing structured intensity, reporting insufficient_data', () => {
    const textOnly = observation({
      sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-03T08:00:00.000Z',
      numeric: {},
    });
    const result = evaluateCombinedTrainingConflicts(inputs({
      observations: [observation(), { ...textOnly, notes: 'Treino forte de pernas' } as ConflictObservation],
    }));
    expect(result.evaluations[0].status).toBe('insufficient_data');
    expect(result.evaluations[0].evidence).toEqual([]);
    expect(result.evaluations[0].missingOperands).toContain('weights-1:resisted:strengthPercent1Rm');
  });

  it('recomputes consistently from amended feedback without mutating history', () => {
    const rule: ConflictRule = {
      ...activeRule(), code: 'CYCLIC_PAIN_V1_TEST', severity: 'critical',
      expression: { kind: 'single', term: { capacity: 'cyclic',
        conditions: [{ kind: 'numeric', metric: 'painLevel', op: 'gte', value: 5 }] } },
    };
    const feedback = (pain: number, version: string): ConflictObservation => observation({
      numeric: { painLevel: { value: pain, source: { kind: 'feedback', recordId: 'feedback-run', version } } },
    });
    const old = evaluateCombinedTrainingConflicts(inputs({ rules: [rule], observations: [feedback(3, 'rev-1')] }));
    const revised = evaluateCombinedTrainingConflicts(inputs({ rules: [rule], observations: [feedback(6, 'rev-2')] }));
    expect(old.evaluations[0].status).toBe('not_triggered');
    expect(revised.evaluations[0]).toMatchObject({ status: 'triggered', severity: 'critical' });
    expect(revised.evaluations[0].evidence[0].source.version).toBe('rev-2');
    expect(old.evaluations[0].evidence).toEqual([]);
  });

  it('does not erase capacity provenance or combine unrelated rules', () => {
    const painRule: ConflictRule = {
      ...activeRule(), code: 'CYCLIC_PAIN_TEST',
      expression: { kind: 'single', term: { capacity: 'cyclic',
        conditions: [{ kind: 'numeric', metric: 'painLevel', op: 'gte', value: 5 }] } },
    };
    const result = evaluateCombinedTrainingConflicts(inputs({
      rules: [activeRule(), painRule],
      observations: [
        observation({ numeric: { cyclicZone: release('release-run', 5),
          painLevel: { value: 6, source: { kind: 'check_in', recordId: 'check-1', version: '2' } } } }),
        observation({ sessionId: 'weights-1', capacity: 'resisted', scheduledAt: '2026-11-03T08:00:00.000Z',
          numeric: { strengthPercent1Rm: release('release-weights', 85) } }),
      ],
    }));
    expect(result.evaluations.map((entry) => entry.ruleCode)).toEqual([
      'INTENSE_CYCLIC_THEN_RESISTED_V1_TEST', 'CYCLIC_PAIN_TEST',
    ]);
    expect(result.evaluations[1].evidence[0].source.kind).toBe('check_in');
  });

  it('keeps insufficient_data distinct from no conflict when source coverage is partial', () => {
    const result = evaluateCombinedTrainingConflicts(inputs({ coverage: 'partial',
      observations: [observation({ numeric: { cyclicZone: release('release-run', 3) } })] }));
    expect(result.evaluations[0].status).toBe('insufficient_data');
  });

  it('never evaluates non-active rules; approval alone is not activation', () => {
    const candidate = activeRule();
    expect(evaluateCombinedTrainingConflicts(inputs({ rules: [
      { ...candidate, status: 'draft', approval: undefined },
      { ...candidate, status: 'approved' },
      { ...candidate, status: 'retired' },
    ] })).evaluations.map((entry) => entry.status)).toEqual(['inactive', 'inactive', 'inactive']);
    expect(evaluateCombinedTrainingConflicts(inputs({ rules: [{ ...candidate, status: 'approved' }] }))).toMatchObject({
      state: 'no_active_rules',
    });
  });

  it('rejects forged activation, invalid parameters and cross-contract evidence', () => {
    const rule = activeRule();
    expect(() => evaluateCombinedTrainingConflicts(inputs({ rules: [{ ...rule, approval: undefined }] })))
      .toThrow('homologação profissional');
    expect(() => evaluateCombinedTrainingConflicts(inputs({
      rules: [{ ...rule, expression: { ...rule.expression, kind: 'sequence', minHours: 48, maxHours: 24,
        first: { capacity: 'cyclic', conditions: [{ kind: 'numeric', metric: 'cyclicZone', op: 'gte', value: 4 }] },
        then: { capacity: 'resisted', conditions: [{ kind: 'numeric', metric: 'strengthPercent1Rm', op: 'gte', value: 80 }] } } }],
    }))).toThrow('Janela temporal');
    expect(() => evaluateCombinedTrainingConflicts(inputs({
      observations: [observation({ contractId: 'contract-outro' })],
    }))).toThrow(ConflictProtocolInputError);
  });

  it('never treats midnight of a date-only plan as a precise temporal interval', () => {
    const items = inputs().observations.map((item, index) =>
      index === 0 ? { ...item, timePrecision: 'date' as const } : item
    );
    const result = evaluateCombinedTrainingConflicts(inputs({ observations: items }));
    expect(result.evaluations[0]).toMatchObject({
      status: 'insufficient_data',
      severity: null,
      changesWorkoutAutomatically: false,
    });
    expect(result.evaluations[0].missingOperands).toContain('run-1:weights-1:exact_time');
  });

  it('rejects duplicates and out-of-period evidence rather than fabricating a negative', () => {
    expect(() => evaluateCombinedTrainingConflicts(inputs({
      observations: [observation(), observation()],
    }))).toThrow('Snapshots duplicados');
    expect(() => evaluateCombinedTrainingConflicts(inputs({
      observations: [observation({ scheduledAt: '2026-11-10T09:00:00.000Z' })],
    }))).toThrow('fora da janela');
  });
});
