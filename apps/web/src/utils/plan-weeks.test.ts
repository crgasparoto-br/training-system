import { describe, expect, it } from 'vitest';
import { buildPlanWeeks, findPlanWeekForDate, getLocalDateOnly } from './plan-weeks';

describe('Semanas do plano: filtro por data civil', () => {
  it('inclui o último dia e cria uma semana final parcial quando necessário', () => {
    const weeks = buildPlanWeeks('2026-11-23', '2026-12-07');

    expect(weeks).toHaveLength(3);
    expect(weeks.map((week) => [
      week.globalWeekNumber,
      getLocalDateOnly(week.startDate),
      getLocalDateOnly(week.endDate),
    ])).toEqual([
      [1, '2026-11-23', '2026-11-29'],
      [2, '2026-11-30', '2026-12-06'],
      [3, '2026-12-07', '2026-12-07'],
    ]);
  });

  it('localiza corretamente início, fim, transição semanal e dias fora do plano', () => {
    const weeks = buildPlanWeeks('2026-11-23', '2026-12-07');
    expect(findPlanWeekForDate(weeks, '2026-11-23')?.globalWeekNumber).toBe(1);
    expect(findPlanWeekForDate(weeks, '2026-11-29')?.globalWeekNumber).toBe(1);
    expect(findPlanWeekForDate(weeks, '2026-11-30')?.globalWeekNumber).toBe(2);
    expect(findPlanWeekForDate(weeks, '2026-12-07')?.globalWeekNumber).toBe(3);
    expect(findPlanWeekForDate(weeks, '2026-11-22')).toBeNull();
    expect(findPlanWeekForDate(weeks, '2026-12-08')).toBeNull();
    expect(findPlanWeekForDate(weeks, 'data-invalida')).toBeNull();
  });

  it('não perde semanas na virada de ano nem nas transições de horário de verão', () => {
    const yearBoundary = buildPlanWeeks('2026-12-28', '2027-01-11');
    expect(yearBoundary).toHaveLength(3);
    expect(findPlanWeekForDate(yearBoundary, '2027-01-01')?.globalWeekNumber).toBe(1);
    expect(findPlanWeekForDate(yearBoundary, '2027-01-04')?.globalWeekNumber).toBe(2);

    const dstBoundary = buildPlanWeeks('2026-03-08', '2026-03-22');
    expect(dstBoundary).toHaveLength(3);
    expect(getLocalDateOnly(dstBoundary[2].startDate)).toBe('2026-03-22');
  });

  it('não gera semanas para períodos inválidos, invertidos ou ausentes', () => {
    expect(buildPlanWeeks('2026-12-07', '2026-12-06')).toEqual([]);
    expect(buildPlanWeeks('2026-02-30', '2026-03-03')).toEqual([]);
    expect(buildPlanWeeks('', '2026-03-03')).toEqual([]);
    expect(findPlanWeekForDate([], '2026-11-23')).toBeNull();
  });

  it('compara a data de hoje pelo calendário local, sem recorte UTC', () => {
    expect(getLocalDateOnly(new Date(2026, 10, 23, 0, 2))).toBe('2026-11-23');
    expect(getLocalDateOnly(new Date(2026, 10, 23, 23, 58))).toBe('2026-11-23');
  });
});
