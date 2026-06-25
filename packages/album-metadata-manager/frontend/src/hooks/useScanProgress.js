import { useQuery } from '@tanstack/react-query';
import { fetchScanProgress } from '../api/library';

export function useScanProgress(enabled = false) {
  return useQuery({
    queryKey: ['scanProgress'],
    queryFn: fetchScanProgress,
    enabled,
    refetchInterval: enabled ? 1000 : false, // Poll every second when enabled
    refetchIntervalInBackground: true, // Continue polling even when tab is not focused
  });
}