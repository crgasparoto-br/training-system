import { useEffect, useRef, useState } from 'react';

export const PRONTUARIO_HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_SKIP = 10000;

/** Keeps older versions visible; rejects obsolete responses after a context change. */
export function useProntuarioHistoryPages<T>(
  requestKey: string | null,
  refreshToken: unknown,
  getPage: (skip: number) => Promise<T[]>,
) {
  const getPageRef = useRef(getPage);
  getPageRef.current = getPage;
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const [events, setEvents] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    loadingMoreRef.current = false;
    setEvents([]);
    setHasMore(false);
    setError(false);
    setLoadingMore(false);
    if (!requestKey) {
      setLoading(false);
      return () => { generationRef.current++; };
    }
    setLoading(true);
    getPageRef.current(0)
      .then((rows) => {
        if (generationRef.current !== generation) return;
        setEvents(rows);
        setHasMore(rows.length === PRONTUARIO_HISTORY_PAGE_SIZE);
      })
      .catch(() => { if (generationRef.current === generation) setError(true); })
      .finally(() => { if (generationRef.current === generation) setLoading(false); });
    return () => { generationRef.current++; };
  }, [requestKey, refreshToken, retryToken]);

  const loadMore = async () => {
    const skip = events.length;
    if (!requestKey || loading || !hasMore || loadingMoreRef.current || skip > MAX_HISTORY_SKIP) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(false);
    const generation = generationRef.current;
    try {
      const rows = await getPageRef.current(skip);
      if (generationRef.current !== generation) return;
      setEvents((current) => [...current, ...rows]);
      setHasMore(rows.length === PRONTUARIO_HISTORY_PAGE_SIZE && skip + rows.length <= MAX_HISTORY_SKIP);
    } catch {
      if (generationRef.current === generation) setError(true);
    } finally {
      if (generationRef.current === generation) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  return { events, loading, loadingMore, hasMore, error, loadMore,
    retry: () => setRetryToken((token) => token + 1) };
}
