import { useQuery } from '@tanstack/react-query';
import { fetchAlbums } from '../api/albums';
import { useLibrary } from './useLibrary';

/**
 * Hook for navigating between albums on the Sync to Files page
 * Fetches all albums that are synced to Plex (regardless of file sync status)
 *
 * @param {string|number} currentAlbumId - The current album's ID
 * @param {Object} options - Sort options
 * @param {string} options.sortBy - Field to sort by (default: 'addedAt')
 * @param {string} options.sortOrder - Sort direction (default: 'desc')
 * @returns {Object} Navigation state
 */
export function useFileSyncNavigation(currentAlbumId, options = {}) {
  const {
    sortBy = 'addedAt',
    sortOrder = 'desc',
  } = options;
  const { activeLibrary } = useLibrary();

  // Fetch all albums synced to Plex (for navigation across all file sync states)
  const { data, isLoading } = useQuery({
    queryKey: ['albums', 'navigation', activeLibrary, 'file-sync', sortBy, sortOrder],
    queryFn: () => fetchAlbums({
      page: 1,
      limit: 5000, // Fetch up to 5000 albums
      sortBy,
      sortOrder,
      filter: 'synced', // Synced to Plex
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
    totalAlbums: albums.length,
    isLoading,
  };
}
