import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAlbums } from "../api/albums";

const PREFETCH_THRESHOLD = 3; // Prefetch when within 3 albums of page edge

/**
 * Hook for lightbox navigation across pagination boundaries.
 * Uses TanStack Query cache to efficiently manage page data.
 *
 * @param {Object} params
 * @param {number} params.initialGlobalIndex - Starting position (0 to total-1)
 * @param {number} params.pageSize - Albums per page
 * @param {string} params.sortBy - Sort field
 * @param {string} params.sortOrder - Sort direction
 * @param {string} params.filter - Filter (matched/unmatched/synced)
 * @param {string} params.search - Search query
 * @param {number} params.totalAlbums - Total albums for this filter
 */
export function useLightboxNavigation({
  initialGlobalIndex,
  pageSize,
  sortBy,
  sortOrder,
  filter,
  search,
  totalAlbums,
  artworkQuality = "",
  syncCompleteness = "",
}) {
  const queryClient = useQueryClient();
  const [globalIndex, setGlobalIndex] = useState(initialGlobalIndex);

  // Calculate current page and total pages
  const currentPage = Math.floor(globalIndex / pageSize) + 1;
  const totalPages = Math.ceil(totalAlbums / pageSize);

  // Build query key factory
  const buildQueryKey = useCallback(
    (page) => [
      "albums",
      { page, limit: pageSize, sortBy, sortOrder, search, filter, artworkQuality, syncCompleteness },
    ],
    [pageSize, sortBy, sortOrder, search, filter, artworkQuality, syncCompleteness]
  );

  // Build query options
  const buildQueryOptions = useCallback(
    (page, enabled = true) => ({
      queryKey: buildQueryKey(page),
      queryFn: () =>
        fetchAlbums({
          page,
          limit: pageSize,
          sortBy,
          sortOrder,
          search,
          filter,
          artworkQuality,
          syncCompleteness,
        }),
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: enabled && page >= 1 && page <= totalPages,
    }),
    [buildQueryKey, pageSize, sortBy, sortOrder, search, filter, artworkQuality, syncCompleteness, totalPages]
  );

  // Fetch current page (always enabled)
  const { data: currentPageData, isLoading: isCurrentLoading } = useQuery(
    buildQueryOptions(currentPage)
  );

  // Fetch previous page (for smooth backwards navigation)
  const { data: prevPageData } = useQuery(
    buildQueryOptions(currentPage - 1, currentPage > 1)
  );

  // Fetch next page (for smooth forward navigation)
  const { data: nextPageData } = useQuery(
    buildQueryOptions(currentPage + 1, currentPage < totalPages)
  );

  // Prefetch pages when near boundaries
  useEffect(() => {
    const positionInPage = globalIndex % pageSize;

    // Near end of page? Prefetch page after next
    if (
      positionInPage >= pageSize - PREFETCH_THRESHOLD &&
      currentPage + 2 <= totalPages
    ) {
      queryClient.prefetchQuery(buildQueryOptions(currentPage + 2));
    }

    // Near start of page? Prefetch page before previous
    if (positionInPage < PREFETCH_THRESHOLD && currentPage - 2 >= 1) {
      queryClient.prefetchQuery(buildQueryOptions(currentPage - 2));
    }
  }, [
    globalIndex,
    pageSize,
    currentPage,
    totalPages,
    queryClient,
    buildQueryOptions,
  ]);

  // Get album at a specific global index using available page data
  const getAlbumAtIndex = useCallback(
    (idx) => {
      const page = Math.floor(idx / pageSize) + 1;
      const idxInPage = idx % pageSize;

      // Check which page data we have
      if (page === currentPage && currentPageData?.albums) {
        return currentPageData.albums[idxInPage];
      }
      if (page === currentPage - 1 && prevPageData?.albums) {
        return prevPageData.albums[idxInPage];
      }
      if (page === currentPage + 1 && nextPageData?.albums) {
        return nextPageData.albums[idxInPage];
      }

      // Check TanStack Query cache for other pages
      const cached = queryClient.getQueryData(buildQueryKey(page));
      return cached?.albums?.[idxInPage] || null;
    },
    [
      pageSize,
      currentPage,
      currentPageData,
      prevPageData,
      nextPageData,
      queryClient,
      buildQueryKey,
    ]
  );

  // Current album
  const currentAlbum = useMemo(() => {
    return getAlbumAtIndex(globalIndex);
  }, [globalIndex, getAlbumAtIndex]);

  // Navigation flags
  const hasNext = globalIndex < totalAlbums - 1;
  const hasPrev = globalIndex > 0;

  // Navigation functions
  const goNext = useCallback(() => {
    if (hasNext) {
      setGlobalIndex((i) => i + 1);
    }
  }, [hasNext]);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setGlobalIndex((i) => i - 1);
    }
  }, [hasPrev]);

  const jumpTo = useCallback(
    (index) => {
      if (index >= 0 && index < totalAlbums) {
        setGlobalIndex(index);
      }
    },
    [totalAlbums]
  );

  // Loading state - true when we don't have the current album yet
  const isLoading = isCurrentLoading || !currentAlbum;

  return {
    currentAlbum,
    globalIndex,
    goNext,
    goPrev,
    jumpTo,
    hasNext,
    hasPrev,
    isLoading,
    totalAlbums,
    currentPage,
    totalPages,
  };
}
