import type { ReleaseConsolidatedOperationalWorkoutCommand } from '@corrida/types';
import {
  getExistingReleaseTargetTemporalIssue,
  getReleaseTargetTemporalIssue,
} from './consolidated-prescription-release-guards.js';

const NOW = new Date('2026-08-17T12:00:00.000Z');

function command(
  weekStartDate: string,
  workoutDate: string,
  dayOfWeek: number
): ReleaseConsolidatedOperationalWorkoutCommand {
  return {
    expectedCurrentVersion: 1,
    target: {
      trainingPlanId: 'plan-1',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate,
      placements: [
        {
          projectionKey: 'cyclic:item',
          dayOfWeek,
          workoutDate,
        },
      ],
    },
  };
}

describe('consolidated prescription release temporal guards - issue 320', () => {
  it('TEMP-PERIOD-001 rejeita workoutDate fora do dayOfWeek da semana declarada', () => {
    expect(
      getReleaseTargetTemporalIssue(
        command('2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 2),
        NOW
      )
    ).toMatch(/não pertence à semana operacional/);
  });

  it.each([
    ['passado', '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'],
    ['borda atual', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z'],
  ])('TEMP-DEST-001 rejeita alvo %s mesmo sem estado de execução', (_label, weekStartDate, workoutDate) => {
    expect(getReleaseTargetTemporalIssue(command(weekStartDate, workoutDate, 1), NOW)).toMatch(
      /somente para treino futuro/
    );
  });

  it('TEMP-DEST-001 aceita posicionamento futuro coerente', () => {
    expect(
      getReleaseTargetTemporalIssue(
        command('2026-08-17T00:00:00.000Z', '2026-08-18T00:00:00.000Z', 2),
        NOW
      )
    ).toBeNull();
  });

  it('não permite reescrever target planned existente para outro período', () => {
    expect(
      getExistingReleaseTargetTemporalIssue(
        {
          weekStartDate: new Date('2026-08-24T00:00:00.000Z'),
          workoutDays: [
            {
              dayOfWeek: 1,
              workoutDate: new Date('2026-08-24T00:00:00.000Z'),
            },
          ],
        },
        new Date('2026-08-31T00:00:00.000Z'),
        NOW
      )
    ).toMatch(/outro período/);
  });

  it('rejeita target existente cujo dia persisted diverge de weekStartDate x dayOfWeek', () => {
    expect(
      getExistingReleaseTargetTemporalIssue(
        {
          weekStartDate: new Date('2026-08-24T00:00:00.000Z'),
          workoutDays: [
            {
              dayOfWeek: 2,
              workoutDate: new Date('2026-08-24T00:00:00.000Z'),
            },
          ],
        },
        new Date('2026-08-24T00:00:00.000Z'),
        NOW
      )
    ).toMatch(/datas incompatíveis/);
  });
});
