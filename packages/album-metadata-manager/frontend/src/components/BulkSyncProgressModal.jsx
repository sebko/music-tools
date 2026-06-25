import { useBulkMetadataSync } from "../hooks/useBulkMetadataSync";
import { Button, Modal } from "@music-tools/my-component-library";

/**
 * Modal showing progress during bulk sync operation
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed (run in background)
 * @param {function} onComplete - Called when sync completes and user clicks "View Results"
 */
function BulkSyncProgressModal({ isOpen, onClose, onComplete }) {
  const { progress, stopSync } = useBulkMetadataSync(isOpen);

  const handleStop = async () => {
    try {
      await stopSync.mutateAsync();
    } catch (error) {
      console.error("Error stopping bulk sync:", error);
    }
  };

  // Default progress data if loading or no data
  const progressData = progress || {
    isSyncing: false,
    current: 0,
    total: 0,
    synced: 0,
    failed: 0,
    currentAlbum: null,
    error: null,
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

  // Determine modal state
  const isComplete =
    !progressData.isSyncing &&
    progressData.current === progressData.total &&
    progressData.total > 0;
  const hasError = progressData.error && !progressData.isSyncing;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      closeOnBackdropClick={false}
      className="p-6"
    >
      <div className="mb-4">
        <h2 className="text-xl font-heading text-foreground mb-2">
          {progressData.isSyncing
            ? "Bulk Metadata Sync"
            : isComplete
              ? "Sync Complete!"
              : hasError
                ? "Sync Error"
                : "Sync Stopped"}
        </h2>

        {progressData.isSyncing && (
          <p className="text-sm text-foreground/60">
            Syncing metadata to Plex...
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
            className={`h-full rounded-base transition-all duration-300 border-r-2 border-border ${
              hasError ? "bg-destructive" : "bg-main"
            }`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Current Album */}
      {currentAlbumDisplay && progressData.isSyncing && (
        <div className="mb-4 p-3 bg-background-secondary rounded-base border-2 border-border shadow-light">
          <p className="text-sm text-foreground/60 mb-1">Currently syncing:</p>
          <p className="font-heading text-foreground truncate">
            {currentAlbumDisplay}
          </p>
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-base border-2 border-destructive">
          <p className="text-sm text-foreground/60 mb-1">Error:</p>
          <p className="text-sm text-destructive font-heading">
            {progressData.error}
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
              <span className="block font-heading">Synced</span>
              <span className="text-green-600">
                {progressData.synced.toLocaleString()}
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
        {progressData.isSyncing ? (
          <>
            <Button
              onClick={handleStop}
              variant="secondary"
              size="sm"
              isDisabled={stopSync.isPending}
            >
              {stopSync.isPending ? "Stopping..." : "Stop Sync"}
            </Button>
            <Button onClick={onClose} variant="secondary" size="sm">
              Run in Background
            </Button>
          </>
        ) : (
          <Button onClick={onComplete} variant="primary" size="sm">
            {isComplete ? "View Results" : hasError ? "Close" : "Close"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export default BulkSyncProgressModal;
