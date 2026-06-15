import { Button } from "@music-tools/my-component-library";
import { ArrowRight, LayoutGrid, RotateCcw } from "lucide-react";
import { useLibrary } from "../../hooks/useLibrary";
import { useDeletionMarked, useClearDecisions } from "../../hooks/useDeletionWizard";

function DeleterSetupStep({ libraryId, onNext, onReviewMarked }) {
  const { activeLibraryName } = useLibrary();
  const ready = !!libraryId;
  const { data: markedData } = useDeletionMarked(libraryId, { enabled: ready });
  const clearAll = useClearDecisions(libraryId);

  const judged = markedData?.judged ?? 0;
  const pending = (markedData?.counts?.pending ?? 0) + (markedData?.counts?.failed ?? 0);

  const handleStartOver = () => {
    if (
      window.confirm(
        `Forget all ${judged} judgments for this library? Every album reappears in the swipe feed. Nothing is deleted.`
      )
    ) {
      clearAll.mutate("all");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="p-5 rounded-base border-2 border-border bg-background space-y-3">
        <h2 className="font-heading text-foreground">
          Library{activeLibraryName ? `: ${activeLibraryName}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">
          You'll swipe through the library selected in the top menu. Albums you
          swipe right get marked for deletion — nothing is deleted until you
          review and confirm.
        </p>
      </div>

      {ready && judged > 0 && (
        <div className="flex items-center justify-center gap-3 flex-wrap text-sm text-muted-foreground">
          <span>
            Resuming: {judged} album{judged === 1 ? "" : "s"} already judged
            {pending > 0 && <> · {pending} marked for deletion</>}
          </span>
          {pending > 0 && (
            <Button onClick={onReviewMarked} variant="secondary" size="xs">
              <LayoutGrid className="w-3.5 h-3.5" /> Review marked
            </Button>
          )}
          <Button
            onClick={handleStartOver}
            variant="secondary"
            size="xs"
            disabled={clearAll.isPending}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Start over
          </Button>
        </div>
      )}

      <div className="flex justify-center">
        <Button onClick={onNext} disabled={!ready} variant="primary" size="lg">
          Start swiping <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default DeleterSetupStep;
