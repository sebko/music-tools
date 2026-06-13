import { Button, CardGrid, MediaCard, EmptyState } from "@dj-tools/my-component-library";
import { Trash2, ArrowLeft, X, CheckCircle } from "lucide-react";
import { useDeletionMarked, useUnmarkDeletion, useClearDecisions } from "../../hooks/useDeletionWizard";

// The safety gate: every album marked for deletion is shown as a card and the
// user must explicitly confirm before anything is touched on disk. Each card can
// be unmarked individually (the album re-enters the swipe feed); "Clear all
// marks" sits apart from the destructive CTA so neither is clicked by accident.
function DeleteReviewStep({ libraryId, onConfirm, onBack, onBackToSetup }) {
  const { data, isLoading } = useDeletionMarked(libraryId);
  const unmark = useUnmarkDeletion(libraryId);
  const clearAll = useClearDecisions(libraryId);

  const toDelete = (data?.marked || []).filter(
    (row) => row.deleteStatus === "PENDING" || row.deleteStatus === "FAILED"
  );

  const handleClearAll = () => {
    if (
      window.confirm(
        `Unmark all ${toDelete.length} albums? They'll reappear in the swipe feed. Nothing is deleted.`
      )
    ) {
      clearAll.mutate("marked");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-lg text-foreground">
            {isLoading
              ? "Loading…"
              : `${toDelete.length} album${toDelete.length === 1 ? "" : "s"} marked for deletion`}
          </h2>
          <p className="text-sm text-muted-foreground">
            Folders are moved to the volume's Trash (recoverable until you empty it), then a
            Plex scan removes them from the library. Hover a card to unmark it.
          </p>
        </div>
        {toDelete.length > 0 && (
          <Button onClick={onBack} variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4" /> Keep swiping
          </Button>
        )}
      </div>

      {!isLoading && toDelete.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400" />}
          heading="Nothing marked for deletion"
          description="Swipe right on albums in the game to mark them."
          action={
            <Button onClick={onBackToSetup} variant="primary" size="lg">
              <ArrowLeft className="w-5 h-5" /> Back to Album Deleter
            </Button>
          }
        />
      ) : (
        <CardGrid density="compact">
          {toDelete.map((row) => (
            <MediaCard
              key={row.id}
              imageSrc={row.artworkUrl}
              imageAlt={`${row.artist} - ${row.title}`}
              title={row.title}
              subtitle={row.artist}
              actions={
                <div className="flex items-start justify-end p-2">
                  <button
                    type="button"
                    onClick={() => unmark.mutate(row.ratingKey)}
                    title="Unmark — keep this album"
                    aria-label={`Unmark ${row.title}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-base border-2 border-border bg-background text-foreground text-xs font-heading hover:border-main"
                  >
                    <X className="w-3.5 h-3.5" /> Unmark
                  </button>
                </div>
              }
            >
              {row.deleteStatus === "FAILED" && row.deleteError && (
                <p className="text-xs text-red-600 dark:text-red-400 truncate" title={row.deleteError}>
                  Previous attempt failed
                </p>
              )}
            </MediaCard>
          ))}
        </CardGrid>
      )}

      {toDelete.length > 0 && (
        <div className="flex items-center justify-between gap-4 pt-2 border-t-2 border-border">
          <Button
            onClick={handleClearAll}
            variant="secondary"
            size="sm"
            disabled={clearAll.isPending}
          >
            <X className="w-4 h-4" /> Clear all marks
          </Button>
          <Button onClick={onConfirm} variant="destructive" size="lg">
            <Trash2 className="w-5 h-5" /> Move {toDelete.length} album
            {toDelete.length === 1 ? "" : "s"} to Trash
          </Button>
        </div>
      )}
    </div>
  );
}

export default DeleteReviewStep;
