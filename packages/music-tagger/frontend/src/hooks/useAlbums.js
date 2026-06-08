import { useQuery } from '@tanstack/react-query';
import { fetchAlbums } from '../api/albums';
import { useLibrary } from './useLibrary';

export function useAlbums(page = 1, limit = 50, sortBy = 'dateCreated', sortOrder = 'desc', search = '', filter = '', fileSyncStatus = '', artworkQuality = '', syncCompleteness = '') {
  const { activeLibrary } = useLibrary();

  return useQuery({
    queryKey: ['albums', activeLibrary, { page, limit, sortBy, sortOrder, search, filter, fileSyncStatus, artworkQuality, syncCompleteness }],
    queryFn: () => fetchAlbums({ page, limit, sortBy, sortOrder, search, filter, fileSyncStatus, artworkQuality, syncCompleteness }),
    staleTime: 30000, // Consider data fresh for 30 seconds to reduce re-fetching
    retry: (failureCount, error) => {
      // If database is being set up, keep retrying up to 10 times
      if (error?.requiresSetup && failureCount < 10) {
        return true;
      }
      // Otherwise use default retry logic (3 retries)
      return failureCount < 3;
    },
    retryDelay: (attemptIndex, error) => {
      // If database is being set up, retry every 2 seconds
      if (error?.requiresSetup) {
        return 2000;
      }
      // Otherwise use exponential backoff
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
  });
}
