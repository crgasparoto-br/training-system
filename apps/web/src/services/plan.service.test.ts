import { describe, expect, it } from 'vitest';
import { planService, type SessionType, type TrainingPhase } from './plan.service';

describe('planService: textos pt-BR', () => {
  it('traduz todas as fases sem mojibake', () => {
    const expected: Record<TrainingPhase, string> = {
      base: 'Base Aeróbica',
      build: 'Construção',
      peak: 'Pico',
      recovery: 'Recuperação',
      taper: 'Polimento',
    };

    for (const [phase, label] of Object.entries(expected) as [TrainingPhase, string][]) {
      expect(planService.translatePhase(phase)).toBe(label);
      expect(planService.translatePhase(phase)).not.toMatch(/Ã|Â/);
    }
  });

  it('mantém acentuação correta nos rótulos de sessão e dias da semana', () => {
    expect(planService.translateSessionType('recovery' as SessionType)).toBe('Recuperação');
    expect(planService.getDayName(2)).toBe('Terça');
    expect(planService.getDayName(6)).toBe('Sábado');
  });
});
