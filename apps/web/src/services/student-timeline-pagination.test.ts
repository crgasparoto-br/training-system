import { describe, expect, it } from 'vitest';
import type { StudentSegmentedTimeline } from './aluno.service';
import { appendStudentTimelinePage } from './student-timeline-pagination';

const event = (id: string) => ({
  id, type: 'student_created', title: id, occurredAt: '2026-10-13T12:00:00Z',
  source: { type: 'system', reference: id, recordedByUserId: null },
});

describe('incremental student timeline', () => {
  it('preserves localized errors discovered only on a later page and deduplicates IDs', () => {
    const initial: StudentSegmentedTimeline = {
      alunoId: 'student-1', items: [event('event-1')], total: 1, nextCursor: 'cursor-1',
      partial: false, unavailableDomains: [],
    };
    const second: StudentSegmentedTimeline = {
      alunoId: 'student-1', items: [event('event-1'), event('event-2')],
      total: 2, nextCursor: 'cursor-2', partial: true, unavailableDomains: ['PRNT'],
    };
    const third: StudentSegmentedTimeline = {
      alunoId: 'student-1', items: [event('event-3')], total: 1, nextCursor: null,
      partial: true, unavailableDomains: ['Treinamento', 'PRNT'],
    };
    const merged = appendStudentTimelinePage(appendStudentTimelinePage(initial, second), third);
    expect(merged.items.map((item) => item.id)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(merged.total).toBe(3);
    expect(merged.nextCursor).toBeNull();
    expect(merged.partial).toBe(true);
    expect(merged.unavailableDomains).toEqual(['PRNT', 'Treinamento']);
    // A refreshed first page replaces the old snapshot, rather than inheriting its warning.
    expect(initial.partial).toBe(false);
    expect(initial.unavailableDomains).toEqual([]);
  });

  it('rejects an out-of-student page even if the caller provides one', () => {
    const first: StudentSegmentedTimeline = { alunoId: 'student-1', items: [], total: 0 };
    const other: StudentSegmentedTimeline = {
      alunoId: 'student-2', items: [event('other')], total: 1,
      partial: true, unavailableDomains: ['PRNT'],
    };
    expect(appendStudentTimelinePage(first, other)).toBe(first);
  });
});
