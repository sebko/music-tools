import { useMutation, useQueryClient } from "@tanstack/react-query";
import { matchAlbumMetadata } from "../api/metadata";

/**
 * Mutation for applying a metadata-service match to an album.
 * On success, invalidates the albums list and the single-album
 * query so the Matched tab (and any detail view) reflects the
 * new match without needing a manual refresh.
 *
 * @param {number} albumId
 */
export function useMatchAlbum(albumId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => matchAlbumMetadata(albumId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["album"] });
    },
  });
}
