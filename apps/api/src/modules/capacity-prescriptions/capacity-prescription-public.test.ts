import {
  deriveCapacityAlerts,
  mergeCapacityAlerts,
  serializeCapacityApiData,
} from './capacity-prescription-public.js';

describe('capacity prescription public contract', () => {
  it('serializa relações Prisma no contrato público compartilhado', () => {
    const serialized = serializeCapacityApiData({
      id: 'prescription-1',
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      capacity: 'resisted',
      status: 'planned',
      currentVersion: 1,
      createdByProfessorId: 'professor-1',
      updatedByProfessorId: 'professor-1',
      createdAt: new Date('2026-07-27T12:00:00.000Z'),
      updatedAt: new Date('2026-07-27T12:00:00.000Z'),
      publishesTodayWorkout: false,
      latestVersion: {
        id: 'version-1',
        prescriptionId: 'prescription-1',
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'planned',
        version: 1,
        responsibleProfessorId: 'professor-1',
        technicalJustification: 'Justificativa',
        professorSummary: 'Resumo técnico',
        studentMessage: 'Mensagem prática',
        methodologyVersion: 'v1',
        parameterSetIds: [],
        parameters: null,
        createdAt: new Date('2026-07-27T12:00:00.000Z'),
        publishesTodayWorkout: false,
        sources: [
          {
            sourceType: 'prontuario_goal',
            sourceId: 'goal-1',
            label: 'Objetivo principal',
            assessedAt: new Date('2026-07-26T12:00:00.000Z'),
            origin: 'PRNT-001',
            sourceVersion: '1',
            responsibleProfessorId: 'professor-1',
          },
        ],
        goals: [{ goalId: 'goal-1' }],
        alerts: [{ code: 'PRNT_CONDITION', message: 'Condição', severity: 'warning', sourceRefId: 'alert-1' }],
      },
    }) as any;

    expect(serialized.latestVersion.sources).toBeUndefined();
    expect(serialized.latestVersion.goals).toBeUndefined();
    expect(serialized.latestVersion.sourceRefs).toEqual([
      expect.objectContaining({ type: 'prontuario_goal', id: 'goal-1', origin: 'PRNT-001' }),
    ]);
    expect(serialized.latestVersion.linkedProntuarioGoalIds).toEqual(['goal-1']);
    expect(serialized.latestVersion.createdAt).toBe('2026-07-27T12:00:00.000Z');
  });

  it('serializa datas em respostas genéricas de parâmetros e catálogo', () => {
    const serialized = serializeCapacityApiData([
      {
        id: 'parameter-1',
        code: 'RUN_BASE',
        createdAt: new Date('2026-07-27T12:00:00.000Z'),
        updatedAt: new Date('2026-07-28T12:00:00.000Z'),
        metadata: {
          importedAt: new Date('2026-07-26T12:00:00.000Z'),
        },
      },
    ]) as any[];

    expect(serialized[0]).toMatchObject({
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-28T12:00:00.000Z',
      metadata: { importedAt: '2026-07-26T12:00:00.000Z' },
    });
  });

  it('deriva alertas de prontuário, preferência e avaliação no backend', () => {
    const alerts = deriveCapacityAlerts([
      { type: 'prontuario_alert', id: 'pain-1', label: 'Dor ativa no joelho' },
      { type: 'student_preference', id: 'preference-1', label: 'Prefere natação' },
      { type: 'flexibility_assessment', id: 'assessment-1', label: 'Déficit de quadril' },
    ]);

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PRNT_CONDITION', sourceRefId: 'pain-1', severity: 'warning' }),
        expect.objectContaining({ code: 'STUDENT_PREFERENCE', sourceRefId: 'preference-1' }),
        expect.objectContaining({ code: 'ASSESSMENT_CONTEXT', sourceRefId: 'assessment-1' }),
      ])
    );
  });

  it('preserva alertas explícitos sem duplicar os derivados', () => {
    const derived = deriveCapacityAlerts([
      { type: 'prontuario_alert', id: 'pain-1', label: 'Dor ativa no joelho' },
    ]);
    const merged = mergeCapacityAlerts([derived[0]], derived);
    expect(merged).toHaveLength(1);
  });
});
