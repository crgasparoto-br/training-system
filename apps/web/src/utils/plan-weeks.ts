import { parseDateOnly } from './date';

export type PlanWeek = {
  globalWeekNumber: number;
  startDate: Date;
  endDate: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Use the browser's civil date, not UTC, when locating the current training week. */
export function getLocalDateOnly(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Plan weeks are consecutive seven-day windows anchored to the plan start date. */
export function buildPlanWeeks(startDate: string, endDate: string): PlanWeek[] {
  const planStart = parseDateOnly(startDate);
  const planEnd = parseDateOnly(endDate);
  if (!planStart || !planEnd || planEnd < planStart) return [];

  // UTC calendar arithmetic avoids DST changing the number of plan weeks.
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const inclusiveDayOffset = Math.round(
    (calendarDay(planEnd) - calendarDay(planStart)) / MS_PER_DAY
  );
  const totalWeeks = Math.floor(inclusiveDayOffset / 7) + 1;

  return Array.from({ length: totalWeeks }, (_, index) => {
    const start = new Date(planStart);
    start.setDate(planStart.getDate() + index * 7);

    const naturalEnd = new Date(start);
    naturalEnd.setDate(start.getDate() + 6);

    return {
      globalWeekNumber: index + 1,
      startDate: start,
      endDate: naturalEnd > planEnd ? new Date(planEnd) : naturalEnd,
    };
  });
}

/** Inclusive bounds: a date in the plan belongs to exactly one week. */
export function findPlanWeekForDate(weeks: PlanWeek[], dateOnly: string): PlanWeek | null {
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  return weeks.find((week) => date >= week.startDate && date <= week.endDate) ?? null;
}
