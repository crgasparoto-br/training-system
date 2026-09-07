import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const planDetailsPath = join(process.cwd(), 'src/pages/PlanDetails.tsx');
const planDetailsSource = readFileSync(planDetailsPath, 'utf8');

describe('PlanDetails: montagem semanal canônica', () => {
  it('não reintroduz o CRUD web legado de Microcycle', () => {
    expect(planDetailsSource).not.toMatch(/SessionModal/);
    expect(planDetailsSource).not.toMatch(/\bcreateSession\b/);
    expect(planDetailsSource).not.toMatch(/\bupdateSession\b/);
    expect(planDetailsSource).not.toMatch(/\bdeleteSession\b/);
    expect(
      existsSync(join(process.cwd(), 'src/components/SessionModal.tsx'))
    ).toBe(false);
  });

  it('navega pela posição canônica calculada para o WorkoutBuilder2', () => {
    expect(planDetailsSource).toContain('resolveWorkoutBuilderPosition');
    expect(planDetailsSource).toContain(
      'navigate(`/plans/${id}/workout-builder/${mesocycleNumber}/${weekNumber}`)'
    );
    expect(planDetailsSource).toContain('matrix?.weeksPerMesocycle ?? 4');
  });

  it('mantém Cíclico e Resistido como planejamentos independentes na mesma semana', () => {
    expect(planDetailsSource).toContain('const cyclicStimulus =');
    expect(planDetailsSource).toContain('const resistedStimulus =');
    expect(planDetailsSource).toContain("Cíclico {cyclicStimulus ? 'planejado' : 'a definir'}");
    expect(planDetailsSource).toContain("Resistido {resistedStimulus ? 'planejado' : 'a definir'}");
    expect(planDetailsSource).not.toMatch(/SessionType/);
  });
});
