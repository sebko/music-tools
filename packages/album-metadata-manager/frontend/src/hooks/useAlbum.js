import { useQuery } from '@tanstack/react-query';
import { fetchAlbum } from '../api/albums';
import { useLibrary } from './useLibrary';

export function useAlbum(id) {
  const { activeLibrary } = useLibrary();

  return useQuery({
    queryKey: ['album', activeLibrary, id],
    queryFn: () => fetchAlbum(id),
    enabled: !!id, // Only fetch if id is provided
  });
}
