import { useQuery } from '@tanstack/react-query';
import { fetchAlbum } from '../api/albums';

export function useAlbum(id) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => fetchAlbum(id),
    enabled: !!id, // Only fetch if id is provided
  });
}