import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshAlbum } from "../api/albums";

export function useRefreshAlbum(albumId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshAlbum(albumId),
    onSuccess: () => {
      // Invalidate related queries to trigger fresh fetches
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });
      queryClient.invalidateQueries({ queryKey: ["metadataSearch", albumId] });
    },
    onError: (error) => {
      console.error("Album refresh failed:", error.message);
    },
  });
}
