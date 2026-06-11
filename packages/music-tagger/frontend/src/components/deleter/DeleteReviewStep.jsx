import { Button } from "@dj-tools/my-component-library";
import { Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import { useDeletionMarked } from "../../hooks/useDeletionWizard";

// The safety gate: every album marked for deletion is listed and the user must
// explicitly confirm before anything is touched on disk.
function DeleteReviewStep({ libraryId, onConfirm, onBack }) {
  const { data, isLoading } = useDeletionMarked(libraryId);

  const toDelete = (data?.marked || []).filter(
    (row) => row.deleteStatus === "PENDING" || row.deleteStatus === "FAILED"
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-6 rounded-base border-2 border-border bg-background space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-500" />
          <h2 className="font-heading text-lg text-foreground">
            {isLoading
              ? "Loading…"
              : `${toDelete.length} album${toDelete.length === 1 ? "" : "s"} will be moved to the Trash`}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Album folders are moved to the volume's Trash (recoverable until you empty
          it), then a Plex scan removes them from the library.
        </p>

        {toDelete.length > 0 && (
          <ul className="text-sm text-foreground space-y-0.5 max-h-80 overflow-y-auto border-t-2 border-border pt-3">
            {toDelete.map((row) => (
              <li key={row.id} className="truncate">
                {row.artist} — {row.title}
                {row.deleteStatus === "FAILED" && row.deleteError && (
                  <span className="text-red-600 dark:text-red-400">
                    {" "}
                    · previous attempt failed: {row.deleteError}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!isLoading && toDelete.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing is marked for deletion.</p>
        )}
      </div>

      <div className="flex justify-center gap-3">
        <Button onClick={onBack} variant="secondary">
          <ArrowLeft className="w-4 h-4" /> Keep swiping
        </Button>
        <Button onClick={onConfirm} variant="destructive" disabled={toDelete.length === 0}>
          <Trash2 className="w-4 h-4" /> Move {toDelete.length} album
          {toDelete.length === 1 ? "" : "s"} to Trash
        </Button>
      </div>
    </div>
  );
}

export default DeleteReviewStep;
