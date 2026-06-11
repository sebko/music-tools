import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSwipeGame } from './useSwipeGame';
import {
  fetchCandidates,
  recordDecision,
  undoDecision,
  fetchShortlist,
  startCopy,
  getCopyProgress,
  cancelCopy,
} from '../api/favouritesWizard';

/** The favourites swipe game: right = shortlist for copying, left = skip. */
export function useFavouritesGame(sourceId, destId, { enabled = true } = {}) {
  return useSwipeGame({
    queryKey: ['favourites-candidates', sourceId, destId],
    fetchCandidates: (limit) => fetchCandidates(sourceId, destId, limit),
    recordDecision: (album, decision) => recordDecision(sourceId, destId, album, decision),
    undoDecision: (ratingKey) => undoDecision(sourceId, destId, ratingKey),
    rightDecision: 'KEEP',
    enabled: enabled && !!sourceId && !!destId,
  });
}

/** Shortlist + per-status counts for the pair (resume info and summary fallback). */
export function useFavouritesShortlist(sourceId, destId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['favourites-shortlist', sourceId, destId],
    queryFn: () => fetchShortlist(sourceId, destId),
    enabled: enabled && !!sourceId && !!destId,
  });
}

/** Copy operation: start/cancel + progress polling. */
export function useFavouritesCopy(sourceId, destId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const wasCopyingRef = useRef(false);

  const { data: progress, dataUpdatedAt: progressUpdatedAt } = useQuery({
    queryKey: ['favourites-copy-progress'],
    queryFn: getCopyProgress,
    enabled,
    refetchInterval: (query) => {
      if (!enabled) return false;
      return query.state.data?.isCopying ? 500 : false;
    },
    refetchIntervalInBackground: true,
  });

  const start = useMutation({
    mutationFn: () => startCopy(sourceId, destId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favourites-copy-progress'] });
    },
    onError: (error) => console.error('Failed to start favourites copy:', error),
  });

  const cancel = useMutation({
    mutationFn: cancelCopy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favourites-copy-progress'] });
    },
  });

  // On copy completion, refresh shortlist + candidates (statuses changed)
  useEffect(() => {
    const isCopying = progress?.isCopying || false;
    if (wasCopyingRef.current && !isCopying) {
      queryClient.invalidateQueries({ queryKey: ['favourites-shortlist'] });
      queryClient.invalidateQueries({ queryKey: ['favourites-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
    wasCopyingRef.current = isCopying;
  }, [progress?.isCopying, queryClient]);

  return {
    start,
    cancel,
    progress: progress || {
      isCopying: false,
      current: 0,
      total: 0,
      copied: 0,
      skippedExists: 0,
      failed: 0,
      results: [],
    },
    progressUpdatedAt,
    isCopying: progress?.isCopying || false,
  };
}
