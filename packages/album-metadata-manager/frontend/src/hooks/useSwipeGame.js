import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

const FETCH_LIMIT = 20;
const REFILL_THRESHOLD = 5;
const PRELOAD_COUNT = 5;

/**
 * Generic swipe game over a server-side candidate feed. Judged albums drop out of
 * the feed server-side, so refetching always returns the next unjudged batch.
 * Maintains a local queue with optimistic judging, undo, and artwork preloading.
 *
 * @param {Object} config
 * @param {Array} config.queryKey - TanStack key for the candidate feed
 * @param {Function} config.fetchCandidates - (limit) => { candidates, remaining, totals }
 * @param {Function} config.recordDecision - (album, decision) => { shortlistCount }
 * @param {Function} config.undoDecision - (ratingKey) => { shortlistCount }
 * @param {string} config.rightDecision - decision recorded for a right swipe (e.g. "KEEP", "DELETE")
 * @param {string} [config.leftDecision="SKIP"] - decision recorded for a left swipe
 * @param {boolean} [config.enabled=true]
 */
export function useSwipeGame({
  queryKey,
  fetchCandidates,
  recordDecision,
  undoDecision,
  rightDecision,
  leftDecision = 'SKIP',
  enabled = true,
}) {
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]); // [{ album, decision }]
  const [shortlistCount, setShortlistCount] = useState(0);
  // Every ratingKey judged locally this session — keeps refetches (whose data may
  // race in-flight decision mutations) from re-adding judged albums to the queue.
  const judgedKeysRef = useRef(new Set());

  // Reset local state when the feed identity changes (e.g. different libraries)
  const feedId = JSON.stringify(queryKey);
  const feedIdRef = useRef(feedId);
  useEffect(() => {
    if (feedIdRef.current !== feedId) {
      feedIdRef.current = feedId;
      judgedKeysRef.current = new Set();
      setQueue([]);
      setHistory([]);
      setShortlistCount(0);
    }
  }, [feedId]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchCandidates(FETCH_LIMIT),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });

  // Seed the shortlist counter from server totals on first load
  useEffect(() => {
    if (data?.totals) setShortlistCount(data.totals.kept);
  }, [data?.totals]);

  // Merge fetched candidates into the queue (dedup by ratingKey, drop judged)
  useEffect(() => {
    if (!data?.candidates) return;
    setQueue((prev) => {
      const seen = new Set(prev.map((a) => a.ratingKey));
      const fresh = data.candidates.filter(
        (a) => !seen.has(a.ratingKey) && !judgedKeysRef.current.has(a.ratingKey)
      );
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [data]);

  // Refill when running low
  useEffect(() => {
    if (!enabled || isFetching) return;
    if (queue.length < REFILL_THRESHOLD && (data?.remaining ?? 0) > queue.length) {
      refetch();
    }
  }, [queue.length, enabled, isFetching, data?.remaining, refetch]);

  // Preload upcoming artwork so swipes feel instant
  useEffect(() => {
    queue.slice(1, 1 + PRELOAD_COUNT).forEach((album) => {
      if (album.artworkUrl) {
        const img = new Image();
        img.src = album.artworkUrl;
      }
    });
  }, [queue]);

  const decisionMutation = useMutation({
    mutationFn: ({ album, decision }) => recordDecision(album, decision),
    onSuccess: (result) => setShortlistCount(result.shortlistCount),
    onError: (error, { album }) => {
      console.error('Failed to record decision:', error);
      // Roll back: put the album back at the front of the queue
      judgedKeysRef.current.delete(album.ratingKey);
      setHistory((prev) => prev.filter((h) => h.album.ratingKey !== album.ratingKey));
      setQueue((prev) => [album, ...prev.filter((a) => a.ratingKey !== album.ratingKey)]);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (ratingKey) => undoDecision(ratingKey),
    onSuccess: (result) => setShortlistCount(result.shortlistCount),
    onError: (error) => console.error('Failed to undo decision:', error),
  });

  // direction: 'right' | 'left'
  const judge = useCallback(
    (direction) => {
      const decision = direction === 'right' ? rightDecision : leftDecision;
      setQueue((prev) => {
        const [album, ...rest] = prev;
        if (!album) return prev;
        judgedKeysRef.current.add(album.ratingKey);
        setHistory((h) => [...h, { album, decision }]);
        decisionMutation.mutate({ album, decision });
        return rest;
      });
    },
    [decisionMutation, rightDecision, leftDecision]
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      judgedKeysRef.current.delete(last.album.ratingKey);
      undoMutation.mutate(last.album.ratingKey);
      setQueue((q) => [last.album, ...q.filter((a) => a.ratingKey !== last.album.ratingKey)]);
      return prev.slice(0, -1);
    });
  }, [undoMutation]);

  return {
    currentAlbum: queue[0] || null,
    nextAlbums: queue.slice(1, 4),
    judge,
    undo,
    canUndo: history.length > 0,
    shortlistCount,
    remaining: data?.remaining ?? null,
    totals: data?.totals ?? null,
    isLoading,
    isExhausted: !isLoading && !isFetching && queue.length === 0 && data != null,
  };
}
