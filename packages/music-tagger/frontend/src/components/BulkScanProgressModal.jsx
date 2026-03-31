import { useBulkMetadataScan } from "../hooks/useBulkMetadataScan";
import { Button, Modal } from "@dj-tools/my-component-library";

function BulkScanProgressModal({ isOpen, onClose, onComplete }) {
  const { progress, stopScan } = useBulkMetadataScan(isOpen);

  const handleStop = async () => {
    try {
      await stopScan.mutateAsync();
    } catch (error) {
      console.error("Error stopping bulk scan:", error);
    }
  };

  // Default progress data if loading or no data
  const progressData = progress || {
    isScanning: false,
    current: 0,
    total: 0,
    matched: 0,
    failed: 0,
    currentAlbum: null,
  };

  // Calculate progress percentage
  const progressPercent =
    progressData.total > 0
      ? Math.round((progressData.current / progressData.total) * 100)
      : 0;

  // Format current album display
  const currentAlbumDisplay =
    progressData.currentAlbum?.title && progressData.currentAlbum?.artist
      ? `${progressData.currentAlbum.artist} - ${progressData.currentAlbum.title}`
      : progressData.currentAlbum?.title || "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md" closeOnBackdropClick={false} className="p-6">
      <div className="mb-4">
          <h2 className="text-xl font-heading text-foreground mb-2">
            {progressData.isScanning
              ? "Bulk Metadata Scan"
              : progressData.current === progressData.total && progressData.total > 0
              ? "Scan Complete!"
              : "Scan Stopped"}
          </h2>

          {progressData.isScanning && (
            <p className="text-sm text-foreground/60">
              Searching for metadata matches...
            </p>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-foreground/60 mb-1">
            <span>{progressPercent}% complete</span>
            {progressData.total > 0 && (
              <span>
                {progressData.current} / {progressData.total} albums
              </span>
            )}
          </div>
          <div className="w-full bg-background-secondary rounded-base h-3 mb-2 border-2 border-border shadow-light">
            <div
              className="bg-main h-full rounded-base transition-all duration-300 border-r-2 border-border"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Current Album */}
        {currentAlbumDisplay && progressData.isScanning && (
          <div className="mb-4 p-3 bg-background-secondary rounded-base border-2 border-border shadow-light">
            <p className="text-sm text-foreground/60 mb-1">
              Currently processing:
            </p>
            <p className="font-heading text-foreground truncate">
              {currentAlbumDisplay}
            </p>
          </div>
        )}

        {/* Stats */}
        {progressData.total > 0 && (
          <div className="mb-4 text-sm text-foreground/60">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="block font-heading">Total</span>
                <span>{progressData.total.toLocaleString()}</span>
              </div>
              <div>
                <span className="block font-heading">Matched</span>
                <span className="text-green-600">
                  {progressData.matched.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block font-heading">Failed</span>
                <span className="text-destructive">
                  {progressData.failed.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          {progressData.isScanning ? (
            <Button
              onClick={handleStop}
              variant="secondary"
              size="sm"
              isDisabled={stopScan.isPending}
            >
              {stopScan.isPending ? "Stopping..." : "Stop Scan"}
            </Button>
          ) : (
            <Button
              onClick={onComplete}
              variant="primary"
              size="sm"
            >
              {progressData.current === progressData.total && progressData.total > 0
                ? "View Results"
                : "Close"}
            </Button>
          )}
        </div>
    </Modal>
  );
}

export default BulkScanProgressModal;

