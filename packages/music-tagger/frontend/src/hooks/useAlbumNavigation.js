import { useQuery } from '@tanstack/react-query';
import { fetchAlbums } from '../api/albums';

/**
 * Hook for navigating between matched albums on the sync page
 * Fetches all matched albums and provides prev/next album info
 *
 * @param {string|number} currentAlbumId - The current album's ID
 * @param {Object} options - Sort options
 * @param {string} options.sortBy - Field to sort by (default: 'addedAt')
 * @param {string} options.sortOrder - Sort direction (default: 'desc')
 * @returns {Object} Navigation state
 */
export function useAlbumNavigation(currentAlbumId, options = {}) {
  const {
    sortBy = 'addedAt',
    sortOrder = 'desc',
  } = options;

  // Fetch all matched and synced albums for navigation
  // Using a high limit to get all albums with Redacted matches in one request
  const { data, isLoading } = useQuery({
    queryKey: ['albums', 'navigation', 'matchedOrSynced', sortBy, sortOrder],
    queryFn: () => fetchAlbums({
      page: 1,
      limit: 5000, // Fetch up to 5000 albums
      sortBy,
      sortOrder,
      filter: 'matchedOrSynced',
    }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const albums = data?.albums || [];
  // Compare as strings since API returns id as string
  const currentIndex = albums.findIndex(a => String(a.id) === String(currentAlbumId));

  // Get prev/next albums if they exist
  const prevAlbum = currentIndex > 0 ? albums[currentIndex - 1] : null;
  const nextAlbum = currentIndex >= 0 && currentIndex < albums.length - 1
    ? albums[currentIndex + 1]
    : null;

  return {
    prevAlbum,
    nextAlbum,
    currentIndex: currentIndex >= 0 ? currentIndex : null,
    totalMatched: albums.length,
    isLoading,
  };
}
