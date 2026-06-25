import { useMutation } from "@tanstack/react-query";
import { syncAlbumToFiles } from "../api/syncToFiles";

/**
 * Custom hook for syncing Plex metadata to local file tags
 * Provides mutation for syncing a single album
 */
export function useSyncToFiles() {
  const syncToFiles = useMutation({
    mutationFn: ({ albumId, selectedFields }) =>
      syncAlbumToFiles(albumId, selectedFields),
    onSuccess: (data) => {
      console.log("Sync to files completed:", data);
      // Invalidate file-metadata cache for this album if we had one
      // For now, just log success
    },
    onError: (error) => {
      console.error("Failed to sync to files:", error);
    },
  });

  return {
    syncToFiles,
    isLoading: syncToFiles.isPending,
    error: syncToFiles.error,
    data: syncToFiles.data,
  };
}
