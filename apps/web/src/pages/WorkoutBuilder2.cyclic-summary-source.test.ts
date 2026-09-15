import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const builderPath = join(process.cwd(), 'src/pages/WorkoutBuilder2/index.tsx');
const builderSource = readFileSync(builderPath, 'utf8');

describe('WorkoutBuilder2: origem do resumo cíclico', () => {
  it('carrega o resumo semanal a partir da matriz canônica', () => {
    expect(builderSource).toContain('periodizationService.getCyclicStimulusByMatrix(matrix.id)');
    expect(builderSource).toContain('resolveWorkoutBuilderCyclicSummary(');
  });

  it('não reintroduz o mock provisório de periodização', () => {
    expect(builderSource).not.toContain('const mockPeriodization =');
    expect(builderSource).not.toContain('totalVolumeMinutes: 284');
  });
});
