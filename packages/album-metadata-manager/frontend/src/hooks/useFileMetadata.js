import { useQuery } from "@tanstack/react-query";
import { fetchFileMetadata } from "../api/fileMetadata";
import { useLibrary } from "./useLibrary";

/**
 * Hook for fetching file metadata (ID3/Vorbis tags) for an album
 * @param {string} albumId - The album ID (Plex rating key)
 * @returns {Object} TanStack Query result with file metadata
 */
export function useFileMetadata(albumId) {
  const { activeLibrary } = useLibrary();

  return useQuery({
    queryKey: ["fileMetadata", activeLibrary, albumId],
    queryFn: () => fetchFileMetadata(albumId),
    enabled: !!albumId,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
