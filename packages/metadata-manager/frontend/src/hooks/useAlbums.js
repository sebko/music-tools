import { useQuery } from "@tanstack/react-query";
import { fetchAlbums, fetchAlbumTracks } from "../api/albums";

export function useAlbums(page = 1, limit = 50, search = "", sortBy = "album", sortOrder = "desc") {
  return useQuery({
    queryKey: ["albums", { page, limit, search, sortBy, sortOrder }],
    queryFn: () => fetchAlbums({ page, limit, search, sortBy, sortOrder }),
    keepPreviousData: true,
    staleTime: 30000,
  });
}

export function useAlbumTracks(albumName) {
  return useQuery({
    queryKey: ["albumTracks", albumName],
    queryFn: () => fetchAlbumTracks(albumName),
    enabled: !!albumName,
    staleTime: 30000,
  });
}
