import { Button } from "@dj-tools/my-component-library";
import { Loader2, XCircle } from "lucide-react";
import { useOperationFinished } from "../../hooks/useOperationFinished";

// Inline copy progress: poll-driven bar with live counters and a cancel button.
function CopyProgressStep({ copy, onFinished }) {
  const { progress, progressUpdatedAt, isCopying, cancel, start } = copy;

  useOperationFinished({ isRunning: isCopying, start, progressUpdatedAt }, onFinished);

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="p-6 rounded-base border-2 border-border bg-background space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-main" />
          <h2 className="font-heading text-foreground">
            Copying albums… {progress.current}/{progress.total}
          </h2>
        </div>

        <div className="h-3 rounded-base border-2 border-border overflow-hidden bg-secondary-background">
          <div
            className="h-full bg-main transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {progress.currentAlbum && (
          <p className="text-sm text-muted-foreground truncate">
            {progress.currentAlbum.artist} — {progress.currentAlbum.title}
          </p>
        )}

        <div className="flex gap-4 text-sm font-heading">
          <span className="text-green-600 dark:text-green-400">✓ {progress.copied} copied</span>
          <span className="text-muted-foreground">↷ {progress.skippedExists} already there</span>
          <span className="text-red-600 dark:text-red-400">✗ {progress.failed} failed</span>
        </div>

        {(progress.error || start.error) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {progress.error || start.error.message}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          onClick={() => cancel.mutate()}
          variant="secondary"
          disabled={!isCopying || cancel.isPending}
        >
          <XCircle className="w-4 h-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export default CopyProgressStep;
