import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  startBulkSyncToFiles,
  getBulkSyncToFilesProgress,
  stopBulkSyncToFiles,
} from "../api/bulkSyncToFiles";

/**
 * Custom hook for bulk syncing Plex metadata to local file tags
 * Provides mutations and progress tracking
 * @param {boolean} enabled - Whether to actively poll progress (default: true)
 */
export function useBulkSyncToFiles(enabled = true) {
  const queryClient = useQueryClient();
  const wasSyncingRef = useRef(false);

  // Poll progress endpoint while syncing
  const { data: progress } = useQuery({
    queryKey: ["bulk-sync-to-files-progress"],
    queryFn: getBulkSyncToFilesProgress,
    enabled, // Only poll when enabled
    refetchInterval: (query) => {
      if (!enabled) return false;
      // Poll every 500ms while syncing, stop when done
      return query.state.data?.isSyncing ? 500 : false;
    },
    refetchIntervalInBackground: true,
  });

  // Start bulk sync mutation
  const startSync = useMutation({
    mutationFn: ({ selectedFields, resync = false }) => startBulkSyncToFiles(selectedFields, resync),
    onSuccess: () => {
      console.log("Bulk sync to files started successfully");
      // Immediately start polling progress
      queryClient.invalidateQueries({ queryKey: ["bulk-sync-to-files-progress"] });
    },
    onError: (error) => {
      console.error("Failed to start bulk sync to files:", error);
    },
  });

  // Stop bulk sync mutation
  const stopSync = useMutation({
    mutationFn: stopBulkSyncToFiles,
    onSuccess: () => {
      console.log("Bulk sync to files stopped successfully");
      // Refresh albums list when sync stops
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["bulk-sync-to-files-progress"] });
    },
    onError: (error) => {
      console.error("Failed to stop bulk sync to files:", error);
    },
  });

  // Watch for sync completion and invalidate albums cache
  useEffect(() => {
    const isCurrentlySyncing = progress?.isSyncing || false;

    // Detect transition from syncing -> not syncing (sync completed)
    if (wasSyncingRef.current && !isCurrentlySyncing) {
      console.log("Bulk sync to files completed - invalidating albums cache");
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    }

    // Update ref for next render
    wasSyncingRef.current = isCurrentlySyncing;
  }, [progress?.isSyncing, queryClient]);

  return {
    startSync,
    stopSync,
    progress: progress || {
      isSyncing: false,
      current: 0,
      total: 0,
      synced: 0,
      failed: 0,
      error: null,
    },
    isSyncing: progress?.isSyncing || false,
  };
}
