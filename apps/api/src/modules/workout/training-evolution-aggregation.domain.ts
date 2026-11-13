/** Chronological aggregation of canonical observations, without ID-based latest selection. */
export type AggregationKind = 'sum' | 'mean' | 'last';
type ChronologicalObservation = {
  value: number;
  date: string;
  sessionId: string;
  sourceId: string;
  performedAt: string | null;
};

function performedAtMs(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function ambiguousLatestOrder(values: ChronologicalObservation[]): boolean {
  if (values.length < 2) return false;
  const timestamps = values.map((entry) => performedAtMs(entry.performedAt));
  return timestamps.some((timestamp) => timestamp === null)
    || new Set(timestamps).size !== timestamps.length;
}

export function observationOrder(aggregation: AggregationKind, a: ChronologicalObservation, b: ChronologicalObservation): number {
  const chronological = aggregation === 'last'
    ? (performedAtMs(a.performedAt) ?? 0) - (performedAtMs(b.performedAt) ?? 0)
    : a.date.localeCompare(b.date);
  return chronological || a.sessionId.localeCompare(b.sessionId) || a.sourceId.localeCompare(b.sourceId);
}

export function measure(aggregation: AggregationKind, values: ChronologicalObservation[]): number {
  const ordered = [...values].sort((a, b) => observationOrder(aggregation, a, b));
  if (aggregation === 'last') return ordered[ordered.length - 1].value;
  const total = ordered.reduce((sum, entry) => sum + entry.value, 0);
  return aggregation === 'mean' ? total / ordered.length : total;
}
