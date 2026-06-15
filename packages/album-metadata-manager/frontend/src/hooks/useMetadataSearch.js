import { useMutation } from '@tanstack/react-query';
import { searchAlbumMetadata } from '../api/metadata';

/**
 * Hook for searching metadata for a single album
 * @param {number} albumId - Album ID to search for
 * @returns {Object} Mutation object with mutate, data, isLoading, error, etc.
 */
export function useMetadataSearch(albumId) {
  return useMutation({
    mutationFn: ({ services, customQuery }) => searchAlbumMetadata(albumId, services, customQuery),
    onSuccess: (data) => {
      console.log('Metadata search completed:', data);
    },
    onError: (error) => {
      console.error('Metadata search failed:', error);
    },
  });
}