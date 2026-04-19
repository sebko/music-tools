import { useState, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useStartLibraryScan, useStopLibraryScan } from './useLibraryScan';
import { fetchScanProgress, startScanAll } from '../api/library';

export function useLibraryScanManager() {
  const [showScanModal, setShowScanModal] = useState(false);
  const queryClient = useQueryClient();
  const startScan = useStartLibraryScan();
  const stopScan = useStopLibraryScan();

  // Check for running scan on mount
  const { data: initialScanStatus } = useQuery({
    queryKey: ['scanProgressCheck'],
    queryFn: fetchScanProgress,
    refetchInterval: false, // Only check once on mount
    staleTime: 0, // Always fetch fresh
  });

  // Auto-open modal if scan is already running
  useEffect(() => {
    if (initialScanStatus?.isScanning) {
      setShowScanModal(true);
    }
  }, [initialScanStatus]);

  const handleStartScan = async () => {
    try {
      await startScan.mutateAsync();
      // Clear stale scan progress cache so the modal opens without showing old error state
      queryClient.removeQueries({ queryKey: ['scanProgress'] });
      setShowScanModal(true);
    } catch (error) {
      console.error("Error starting scan:", error);
      const isAlreadyRunning = error.message?.includes('Scan already in progress');
      if (isAlreadyRunning) {
        setShowScanModal(true);
      } else {
        alert("Failed to start library scan: " + error.message);
      }
    }
  };

  const handleStartScanAll = async () => {
    try {
      await startScanAll();
      queryClient.removeQueries({ queryKey: ['scanProgress'] });
      setShowScanModal(true);
    } catch (error) {
      console.error("Error starting scan-all:", error);
      const isAlreadyRunning = error.message?.includes('Scan already in progress');
      if (isAlreadyRunning) {
        setShowScanModal(true);
      } else {
        alert("Failed to start library scan: " + error.message);
      }
    }
  };

  const handleScanComplete = () => {
    setShowScanModal(false);
    // Invalidate albums query to refresh the list
    queryClient.invalidateQueries({ queryKey: ["albums"] });
  };

  const handleCloseScanModal = () => {
    setShowScanModal(false);
  };

  return {
    // State
    showScanModal,

    // Handlers
    handleStartScan,
    handleStartScanAll,
    handleScanComplete,
    handleCloseScanModal,

    // Mutation states (for UI feedback)
    isStartingScan: startScan.isPending,
    isStoppingScan: stopScan.isPending,

    // Stop scan functionality
    stopScan,
  };
}
