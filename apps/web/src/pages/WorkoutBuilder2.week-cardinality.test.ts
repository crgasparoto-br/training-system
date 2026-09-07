import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const builderPath = join(process.cwd(), 'src/pages/WorkoutBuilder2/index.tsx');
const builderSource = readFileSync(builderPath, 'utf8');
const loadStart = builderSource.indexOf('const matrix = await periodizationService.getMatrixByPlanId(planId);');
const loadEnd = builderSource.indexOf('const templatesByWeek = templates.reduce', loadStart);
const loadSource = builderSource.slice(loadStart, loadEnd);

describe('WorkoutBuilder2: cardinalidade de semanas da matriz', () => {
  it('resolve as semanas a partir da matriz antes de carregar resumos e templates', () => {
    expect(loadStart).toBeGreaterThanOrEqual(0);
    expect(loadEnd).toBeGreaterThan(loadStart);
    expect(loadSource).toContain('resolveWorkoutBuilderWeekOptions(matrix?.weeksPerMesocycle)');
    expect(loadSource).toContain('resolvedWeekOptions.forEach');
    expect(loadSource).toContain('resolvedWeekOptions.map(async (weekNumber)');
  });

  it('não usa o weekOptions renderizado com o fallback antigo para criar templates', () => {
    expect(loadSource).not.toContain('weekOptions.map(async (weekNumber)');
    expect(loadSource).not.toContain('weekOptions.forEach((week)');
  });
});
