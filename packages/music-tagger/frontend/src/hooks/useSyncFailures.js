/**
 * Sync Failures Hooks
 *
 * TanStack Query hooks for managing sync operation failures.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSyncFailures,
  fetchFailureCounts,
  clearSyncFailures,
} from "../api/syncFailures";
import { useLibrary } from "./useLibrary";

/**
 * Hook to fetch recent sync failures
 *
 * @param {string} [operation] - Filter by operation type
 * @param {number} [limit=50] - Maximum failures to return
 * @returns {Object} TanStack Query result
 */
export function useSyncFailures(operation = null, limit = 50) {
  const { activeLibrary } = useLibrary();

  return useQuery({
    queryKey: ["syncFailures", activeLibrary, { operation, limit }],
    queryFn: () => fetchSyncFailures({ operation, limit }),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch failure counts by operation type
 *
 * @returns {Object} TanStack Query result
 */
export function useFailureCounts() {
  const { activeLibrary } = useLibrary();

  return useQuery({
    queryKey: ["syncFailureCounts", activeLibrary],
    queryFn: fetchFailureCounts,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to clear sync failures
 *
 * @returns {Object} TanStack Mutation result
 */
export function useClearSyncFailures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearSyncFailures,
    onSuccess: () => {
      // Invalidate both failures and counts queries
      queryClient.invalidateQueries({ queryKey: ["syncFailures"] });
      queryClient.invalidateQueries({ queryKey: ["syncFailureCounts"] });
    },
  });
}
