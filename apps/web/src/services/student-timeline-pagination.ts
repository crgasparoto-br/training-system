import type { StudentSegmentedTimeline } from './aluno.service';

/** Add an older page without losing per-domain failures discovered later. */
export function appendStudentTimelinePage(
  previous: StudentSegmentedTimeline,
  page: StudentSegmentedTimeline,
): StudentSegmentedTimeline {
  if (previous.alunoId !== page.alunoId) return previous;
  // Two lifecycle rows can represent one canonical clinical source across
  // page boundaries. Deduplicate by source identity, not just raw event ID.
  const identity = (item: StudentSegmentedTimeline['items'][number]) =>
    item.sourceType && item.sourceId
      ? `canonical:${item.type}:${item.sourceType}:${item.sourceId}`
      : `id:${item.id}`;
  const known = new Set(previous.items.map(identity));
  const additional = page.items.filter((item) => {
    const key = identity(item);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
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
