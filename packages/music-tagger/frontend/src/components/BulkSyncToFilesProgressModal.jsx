import { Link } from "react-router-dom";
import { useBulkSyncToFiles } from "../hooks/useBulkSyncToFiles";
import { Button, Modal } from "@dj-tools/my-component-library";

/**
 * Modal showing progress during bulk Plex→File sync operation
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed (run in background)
 * @param {function} onComplete - Called when sync completes and user clicks "View Results"
 */
function BulkSyncToFilesProgressModal({ isOpen, onClose, onComplete }) {
  const { progress, stopSync } = useBulkSyncToFiles(isOpen);

  const handleStop = async () => {
    try {
      await stopSync.mutateAsync();
    } catch (error) {
      console.error("Error stopping bulk sync to files:", error);
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
    corrupted: 0,
    corruptedFiles: [],
    halted: false,
  };

  const hasCorruption = (progressData.corruptedFiles?.length || 0) > 0;

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
    progressData.total > 0 &&
    !hasCorruption;
  const hasError = progressData.error && !progressData.isSyncing && !hasCorruption;
  const hasFailures = !progressData.isSyncing && progressData.failed > 0 && !hasCorruption;

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
          {hasCorruption
            ? "🚨 Corruption Detected"
            : progressData.isSyncing
              ? "Syncing to Files"
              : isComplete
                ? hasFailures
                  ? "Sync Complete with Failures"
                  : "Sync Complete!"
                : hasError
                  ? "Sync Error"
                  : "Sync Stopped"}
        </h2>

        {progressData.isSyncing && !hasCorruption && (
          <p className="text-sm text-foreground/60">
            Writing Plex metadata to local file tags...
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

      {/* Corruption Banner - takes priority over regular error */}
      {hasCorruption && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/40 rounded-base border-4 border-red-700">
          <p className="text-sm font-heading text-red-900 dark:text-red-100 mb-2">
            Audio stream changed during write — bulk sync halted.
          </p>
          <ul className="text-xs font-mono text-red-900 dark:text-red-100 list-disc list-inside max-h-40 overflow-auto">
            {(progressData.corruptedFiles || []).map((c, i) => (
              <li key={`${c.albumId || c.plexRatingKey || i}-${c.file}`}>
                {c.albumArtist ? `${c.albumArtist} — ${c.albumTitle}: ` : ""}
                {c.file}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-900 dark:text-red-100">
            Do not re-run sync on affected album(s) until you've inspected the file(s) manually.
          </p>
        </div>
      )}

      {/* Failures Summary — ordinary per-album failures (not corruption) */}
      {hasFailures && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-base border-2 border-yellow-500">
          <p className="text-sm font-heading text-yellow-900 dark:text-yellow-100">
            {progressData.failed} album(s) failed.{" "}
            <Link
              to="/sync-failures?operation=bulk_sync_files"
              className="underline"
            >
              View details →
            </Link>
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
          <div className={`grid ${hasCorruption || progressData.corrupted > 0 ? "grid-cols-4" : "grid-cols-3"} gap-4`}>
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
            {(hasCorruption || progressData.corrupted > 0) && (
              <div>
                <span className="block font-heading">Corrupted</span>
                <span className="text-red-700 dark:text-red-300 font-bold">
                  {(progressData.corrupted || 0).toLocaleString()}
                </span>
              </div>
            )}
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

export default BulkSyncToFilesProgressModal;
