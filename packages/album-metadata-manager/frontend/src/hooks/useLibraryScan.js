import { useMutation } from '@tanstack/react-query';
import { startLibraryScan, stopLibraryScan } from '../api/library';

export function useStartLibraryScan() {
  return useMutation({
    mutationFn: ({ force = false } = {}) => startLibraryScan({ force }),
    // Note: We don't invalidate albums here because that would refresh the list
    // while the scan is running. Albums are invalidated when scan completes
    // in useLibraryScanManager.handleScanComplete()
  });
}

export function useStopLibraryScan() {
  return useMutation({
    mutationFn: stopLibraryScan,
  });
}
