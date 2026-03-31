import { useScanProgress } from "../hooks/useScanProgress";
import { useStopLibraryScan } from "../hooks/useLibraryScan";
import { Button, Modal } from "@dj-tools/my-component-library";

function ScanProgressModal({ isOpen, onClose, onComplete }) {
  const { data: progress } = useScanProgress(isOpen);
  const stopScan = useStopLibraryScan();

  const handleStop = async () => {
    try {
      await stopScan.mutateAsync();
    } catch (error) {
      console.error("Error stopping scan:", error);
    }
  };

  // Default progress data if loading or no data
  const progressData = progress || {
    isScanning: false,
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
    currentAlbum: "",
    totalAlbums: 0,
    processedAlbums: 0,
    errors: [],
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md" closeOnBackdropClick={false} className="p-6">
      <div className="mb-4">
          <h2 className="text-xl font-heading text-foreground mb-2">
            {progressData.isScanning
              ? "Scanning Music Library"
              : progressData.progress === 100
              ? "Scan Complete!"
              : "Scan Stopped"}
          </h2>

          {progressData.isScanning && (
            <p className="text-sm text-foreground/60">
              Processing your music collection...
            </p>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-foreground/60 mb-1">
            <span>{progressData.progress}% complete</span>
            {progressData.totalFiles > 0 && (
              <span>
                {progressData.processedFiles} / {progressData.totalFiles} files
              </span>
            )}
          </div>
          <div className="w-full bg-background-secondary rounded-base h-3 mb-2 border-2 border-border shadow-light">
            <div
              className="bg-main h-full rounded-base transition-all duration-300 border-r-2 border-border"
              style={{ width: `${progressData.progress}%` }}
            ></div>
          </div>
          {progressData.totalAlbums > 0 && (
            <div className="flex justify-between text-xs text-foreground/50">
              <span>Albums processed</span>
              <span>
                {progressData.processedAlbums} / {progressData.totalAlbums}
              </span>
            </div>
          )}
        </div>

        {/* Current Album */}
        {progressData.currentAlbum && progressData.isScanning && (
          <div className="mb-4 p-3 bg-background-secondary rounded-base border-2 border-border shadow-light">
            <p className="text-sm text-foreground/60 mb-1">
              Currently processing:
            </p>
            <p className="font-heading text-foreground truncate">
              {progressData.currentAlbum}
            </p>
          </div>
        )}

        {/* Stats */}
        {progressData.totalFiles > 0 && (
          <div className="mb-4 text-sm text-foreground/60">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block font-heading">Total Files</span>
                <span>{progressData.totalFiles.toLocaleString()}</span>
              </div>
              <div>
                <span className="block font-heading">Total Albums</span>
                <span>{progressData.totalAlbums.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Errors */}
        {progressData.errors.length > 0 && (
          <div className="mb-4 p-3 bg-destructive/10 rounded-base border-2 border-destructive shadow-light">
            <p className="text-sm font-heading text-destructive mb-1">
              Errors ({progressData.errors.length}):
            </p>
            <div className="max-h-20 overflow-y-auto text-xs text-destructive/80">
              {progressData.errors.slice(-3).map((error, index) => (
                <div key={index} className="mb-1">
                  {error}
                </div>
              ))}
              {progressData.errors.length > 3 && (
                <div className="text-destructive/60">
                  ... and {progressData.errors.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          {progressData.isScanning ? (
            <>
              <Button
                onClick={handleStop}
                variant="secondary"
                size="sm"
                isDisabled={stopScan.isPending}
              >
                {stopScan.isPending ? "Stopping..." : "Stop Scan"}
              </Button>
              <Button
                onClick={onClose}
                variant="secondary"
                size="sm"
              >
                Run in Background
              </Button>
            </>
          ) : (
            <Button
              onClick={onComplete}
              variant="primary"
              size="sm"
            >
              {progressData.progress === 100 ? "View Results" : "Close"}
            </Button>
          )}
        </div>
    </Modal>
  );
}

export default ScanProgressModal;
