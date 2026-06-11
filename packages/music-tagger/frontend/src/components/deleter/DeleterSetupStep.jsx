import { Button } from "@dj-tools/my-component-library";
import { ArrowRight } from "lucide-react";
import GroupedLibrarySelect from "../favourites/GroupedLibrarySelect";
import { useDeletionMarked } from "../../hooks/useDeletionWizard";

function DeleterSetupStep({ servers, libraryId, onLibraryChange, onNext }) {
  const ready = !!libraryId;
  const { data: markedData } = useDeletionMarked(libraryId, { enabled: ready });

  const judged = markedData?.judged ?? 0;
  const pending = markedData?.counts?.pending ?? 0;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="p-5 rounded-base border-2 border-border bg-background space-y-3">
        <h2 className="font-heading text-foreground">Library</h2>
        <p className="text-sm text-muted-foreground">
          The library you'll swipe through. Albums you swipe right get marked for
          deletion — nothing is deleted until you review and confirm.
        </p>
        <GroupedLibrarySelect
          servers={servers}
          value={libraryId}
          onChange={onLibraryChange}
          label="Library"
        />
      </div>

      {ready && judged > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Resuming: {judged} album{judged === 1 ? "" : "s"} already judged
          {pending > 0 && <> · {pending} marked for deletion</>}
        </p>
      )}

      <div className="flex justify-center">
        <Button onClick={onNext} disabled={!ready} variant="primary" size="lg">
          Next <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default DeleterSetupStep;
