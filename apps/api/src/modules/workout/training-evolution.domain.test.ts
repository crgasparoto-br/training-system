import { calculateWeeklyTrainingEvolution } from './training-evolution.domain.js';
import type { WeeklyEvolutionSessionSource } from './training-evolution.domain.js';

const period = { startDate: '2026-11-02', endDate: '2026-11-08' };
const source = (sessionId: string, status: WeeklyEvolutionSessionSource['status']): WeeklyEvolutionSessionSource => ({
  sessionId, status, sourceUpdatedAt: '2026-11-05T12:00:00.000Z',
});

describe('evolução semanal canônica (#405)', () => {
  it('não trata semana sem sessões liberadas como aderência zero', () => {
    expect(calculateWeeklyTrainingEvolution({ period, sessions: [], audience: 'student' })).toMatchObject({
      counts: { prescribedSessions: 0, completedSessions: 0, partialSessions: 0 },
      adherence: { status: 'insufficient_data', value: null, unit: '%' },
      lastSourceUpdateAt: null,
    });
  });

  it('conta apenas completed no numerador, e mostra parciais/não realizadas separadamente', () => {
    const output = calculateWeeklyTrainingEvolution({
      period, audience: 'professor',
      sessions: [source('c', 'not_performed'), source('b', 'partial'), source('a', 'completed'), source('d', 'paused')],
    });
    expect(output.counts).toEqual({
      prescribedSessions: 4, completedSessions: 1, partialSessions: 1,
      notPerformedSessions: 1, pendingSessions: 1,
    });
    expect(output.adherence).toEqual({
      status: 'available', value: 25, unit: '%',
      formula: 'completedSessions / prescribedSessions * 100',
    });
    expect(output.technical?.sessions.map((row) => row.sessionId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('omite evidência técnica da visão do aluno sem afetar a métrica', () => {
    const sessions = [source('a', 'completed'), source('b', 'partial')];
    const student = calculateWeeklyTrainingEvolution({ period, sessions, audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions, audience: 'professor' });
    expect(student.adherence).toEqual(professor.adherence);
    expect(student.technical).toBeUndefined();
    expect(professor.technical?.sessions).toHaveLength(2);
    expect(student.period).toEqual(period);
  });

  it('preserva ausência de timestamp e a versão da fórmula sem inventar fonte', () => {
    const result = calculateWeeklyTrainingEvolution({
      period, audience: 'student',
      sessions: [{ sessionId: 'x', status: 'not_started', sourceUpdatedAt: null }],
    });
    expect(result.lastSourceUpdateAt).toBeNull();
    expect(result.ruleVersion).toBe('weekly-adherence-v1');
    expect(result.adherence).toMatchObject({ status: 'available', value: 0 });
  });

  it('rejeita fonte duplicada, evitando distorcer o denominador', () => {
    expect(() => calculateWeeklyTrainingEvolution({
      period, audience: 'student', sessions: [source('x', 'completed'), source('x', 'partial')],
    })).toThrow(/ID único/);
  });
});
