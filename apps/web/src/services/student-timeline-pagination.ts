import type { StudentSegmentedTimeline } from './aluno.service';

/** Add an older page without losing per-domain failures discovered later. */
export function appendStudentTimelinePage(
  previous: StudentSegmentedTimeline,
  page: StudentSegmentedTimeline,
): StudentSegmentedTimeline {
  if (previous.alunoId !== page.alunoId) return previous;
  const knownIds = new Set(previous.items.map((item) => item.id));
  const additional = page.items.filter((item) => !knownIds.has(item.id));
  return {
    ...previous,
    items: [...previous.items, ...additional],
    nextCursor: page.nextCursor,
    total: previous.total + additional.length,
    partial: Boolean(previous.partial || page.partial),
    unavailableDomains: [...new Set([
      ...(previous.unavailableDomains ?? []), ...(page.unavailableDomains ?? []),
    ])],
  };
}
