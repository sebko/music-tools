import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSwipeGame } from './useSwipeGame';
import {
  fetchCandidates,
  recordDecision,
  undoDecision,
  fetchMarked,
  clearDecisions,
  startDeletion,
  getDeletionProgress,
  cancelDeletion,
} from '../api/deletionWizard';

/** The deleter swipe game: right = mark for deletion, left = skip. */
export function useDeletionGame(libraryId, { enabled = true } = {}) {
  return useSwipeGame({
    queryKey: ['deletion-candidates', libraryId],
    fetchCandidates: (limit) => fetchCandidates(libraryId, limit),
    recordDecision: (album, decision) => recordDecision(libraryId, album, decision),
    undoDecision: (ratingKey) => undoDecision(libraryId, ratingKey),
    rightDecision: 'DELETE',
    enabled: enabled && !!libraryId,
  });
}

/** Albums marked for deletion + per-status counts (review screen, resume, summary). */
export function useDeletionMarked(libraryId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['deletion-marked', libraryId],
    queryFn: () => fetchMarked(libraryId),
    enabled: enabled && !!libraryId,
  });
}

/** Unmark a single album from the review grid (it re-enters the swipe feed). */
export function useUnmarkDeletion(libraryId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ratingKey) => undoDecision(libraryId, ratingKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion-marked', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['deletion-candidates', libraryId] });
    },
    onError: (error) => console.error('Failed to unmark album:', error),
  });
}

/** Bulk-clear decisions: scope 'marked' (unmark all) or 'all' (forget judgments). */
export function useClearDecisions(libraryId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope) => clearDecisions(libraryId, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion-marked', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['deletion-candidates', libraryId] });
    },
    onError: (error) => console.error('Failed to clear decisions:', error),
  });
}

/** Deletion run: start/cancel + progress polling. */
export function useDeletionRun(libraryId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const wasDeletingRef = useRef(false);

  const { data: progress, dataUpdatedAt: progressUpdatedAt } = useQuery({
    queryKey: ['deletion-progress'],
    queryFn: getDeletionProgress,
    enabled,
    refetchInterval: (query) => {
      if (!enabled) return false;
      return query.state.data?.isDeleting ? 500 : false;
    },
    refetchIntervalInBackground: true,
  });

  const start = useMutation({
    mutationFn: () => startDeletion(libraryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion-progress'] });
    },
    onError: (error) => console.error('Failed to start deletion:', error),
  });

  const cancel = useMutation({
    mutationFn: cancelDeletion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion-progress'] });
    },
  });

  // On completion, refresh marked list + candidates (statuses changed)
  useEffect(() => {
    const isDeleting = progress?.isDeleting || false;
    if (wasDeletingRef.current && !isDeleting) {
      queryClient.invalidateQueries({ queryKey: ['deletion-marked'] });
      queryClient.invalidateQueries({ queryKey: ['deletion-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
    wasDeletingRef.current = isDeleting;
  }, [progress?.isDeleting, queryClient]);

  return {
    start,
    cancel,
    progress: progress || {
      isDeleting: false,
      current: 0,
      total: 0,
      deleted: 0,
      failed: 0,
      results: [],
    },
    progressUpdatedAt,
    isDeleting: progress?.isDeleting || false,
  };
}
