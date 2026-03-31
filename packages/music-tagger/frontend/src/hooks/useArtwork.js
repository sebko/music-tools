import { useMutation, useQueryClient } from "@tanstack/react-query";
import { embedAlbumArtwork, uploadAlbumArtwork, bustArtworkCache } from "../api/albums";

/**
 * Hook to embed artwork to an album's files
 * @param {string} albumId - The album ID
 * @returns {Object} React Query mutation object
 */
export function useEmbedArtwork(albumId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (artworkUrl) => embedAlbumArtwork(albumId, artworkUrl),
    onSuccess: () => {
      // Bust the artwork cache to force reload
      bustArtworkCache(albumId);

      // Invalidate album query to refetch album data
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });

      // Refetch the album immediately to show the new artwork
      queryClient.refetchQueries({ queryKey: ["album", albumId] });
    },
  });
}

/**
 * Hook to upload and embed custom artwork to an album's files
 * @param {string} albumId - The album ID
 * @returns {Object} React Query mutation object
 */
export function useUploadArtwork(albumId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file) => uploadAlbumArtwork(albumId, file),
    onSuccess: () => {
      // Bust the artwork cache to force reload
      bustArtworkCache(albumId);

      // Invalidate album query to refetch album data
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });

      // Refetch the album immediately to show the new artwork
      queryClient.refetchQueries({ queryKey: ["album", albumId] });
    },
  });
}
