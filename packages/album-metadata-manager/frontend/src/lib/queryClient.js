import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      // Catch-all: a query that fails with no cached data to render throws to
      // the app-level error boundary (one generic error screen with Retry)
      // instead of every page hand-rolling its own — or worse, rendering an
      // error as an empty state. Queries that already have data keep showing
      // it, so background refetch failures don't blow the page away.
      throwOnError: (error, query) => query.state.data === undefined,
    },
    mutations: {
      retry: 1,
    },
  },
});