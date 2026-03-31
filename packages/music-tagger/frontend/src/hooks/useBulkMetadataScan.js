import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { startBulkMetadataScan, getBulkScanProgress, stopBulkScan } from '../api/metadata';

/**
 * Custom hook for bulk metadata scanning
 * Provides mutations and progress tracking for scanning all unmatched albums
 * @param {boolean} enabled - Whether to actively poll progress (default: true)
 */
export function useBulkMetadataScan(enabled = true) {
  const queryClient = useQueryClient();
  const wasScanningRef = useRef(false);

  // Poll progress endpoint while scanning
  const { data: progress } = useQuery({
    queryKey: ['bulk-scan-progress'],
    queryFn: getBulkScanProgress,
    enabled, // Only poll when enabled
    refetchInterval: (query) => {
      if (!enabled) return false;
      // Poll every 500ms while scanning, stop when done
      // Use query.state.data to check the latest data
      return query.state.data?.isScanning ? 500 : false;
    },
    refetchIntervalInBackground: true,
  });

  // Start bulk scan mutation
  const startScan = useMutation({
    mutationFn: ({ minConfidence = 85, includeMatched = false }) =>
      startBulkMetadataScan(minConfidence, includeMatched),
    onSuccess: () => {
      console.log('Bulk scan started successfully');
      // Immediately start polling progress
      queryClient.invalidateQueries({ queryKey: ['bulk-scan-progress'] });
    },
    onError: (error) => {
      console.error('Failed to start bulk scan:', error);
    },
  });

  // Stop bulk scan mutation
  const stopScan = useMutation({
    mutationFn: stopBulkScan,
    onSuccess: () => {
      console.log('Bulk scan stopped successfully');
      // Refresh albums list when scan stops
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      queryClient.invalidateQueries({ queryKey: ['bulk-scan-progress'] });
    },
    onError: (error) => {
      console.error('Failed to stop bulk scan:', error);
    },
  });

  // Watch for scan completion and invalidate albums cache
  useEffect(() => {
    const isCurrentlyScanning = progress?.isScanning || false;

    // Detect transition from scanning -> not scanning (scan completed)
    if (wasScanningRef.current && !isCurrentlyScanning) {
      console.log('Bulk scan completed - invalidating albums cache');
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    }

    // Update ref for next render
    wasScanningRef.current = isCurrentlyScanning;
  }, [progress?.isScanning, queryClient]);

  return {
    startScan,
    stopScan,
    progress: progress || { isScanning: false, current: 0, total: 0, matched: 0, failed: 0 },
    isScanning: progress?.isScanning || false,
  };
}
