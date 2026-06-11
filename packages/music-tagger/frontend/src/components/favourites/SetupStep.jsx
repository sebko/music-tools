import { Button } from "@dj-tools/my-component-library";
import { ArrowRight } from "lucide-react";
import GroupedLibrarySelect from "./GroupedLibrarySelect";
import { useFavouritesShortlist } from "../../hooks/useFavouritesWizard";

function SetupStep({ servers, sourceId, destId, onSourceChange, onDestChange, onNext }) {
  const ready = !!sourceId && !!destId && sourceId !== destId;
  const { data: shortlistData } = useFavouritesShortlist(sourceId, destId, { enabled: ready });

  const judged = shortlistData?.judged ?? 0;
  const pending = shortlistData?.counts?.pending ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-base border-2 border-border bg-background space-y-3">
          <h2 className="font-heading text-foreground">Source</h2>
          <p className="text-sm text-muted-foreground">
            The library you'll swipe through.
          </p>
          <GroupedLibrarySelect
            servers={servers}
            value={sourceId}
            onChange={onSourceChange}
            label="Source library"
            disabledId={destId}
          />
        </div>

        <div className="p-5 rounded-base border-2 border-border bg-background space-y-3">
          <h2 className="font-heading text-foreground">Destination</h2>
          <p className="text-sm text-muted-foreground">
            Where shortlisted albums get copied.
          </p>
          <GroupedLibrarySelect
            servers={servers}
            value={destId}
            onChange={onDestChange}
            label="Destination library"
            disabledId={sourceId}
          />
        </div>
      </div>

      {ready && judged > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Resuming: {judged} album{judged === 1 ? "" : "s"} already judged
          {pending > 0 && <> · {pending} shortlisted and waiting to copy</>}
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

export default SetupStep;
