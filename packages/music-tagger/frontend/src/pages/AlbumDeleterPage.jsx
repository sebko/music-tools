import { useEffect, useState } from "react";
import { PageHeader } from "@dj-tools/my-component-library";
import { Trash2 } from "lucide-react";
import { useLibrary } from "../hooks/useLibrary";
import { useDeletionGame, useDeletionRun } from "../hooks/useDeletionWizard";
import DeleterSetupStep from "../components/deleter/DeleterSetupStep";
import GameStep from "../components/favourites/GameStep";
import DeleteReviewStep from "../components/deleter/DeleteReviewStep";
import DeleteProgressStep from "../components/deleter/DeleteProgressStep";
import DeleteSummaryStep from "../components/deleter/DeleteSummaryStep";

// Deleter flow: setup (pick library) -> game (swipe right to mark) -> review
// (explicit confirm) -> deleting -> summary. Nothing touches disk before the
// review step is confirmed; folders go to the volume Trash, not rm -rf.
function AlbumDeleterPage() {
  const { servers } = useLibrary();
  const [step, setStep] = useState("setup");
  const [libraryId, setLibraryId] = useState("");

  const run = useDeletionRun(libraryId);
  const game = useDeletionGame(libraryId, { enabled: step === "game" });

  // If a deletion is already running (e.g. page reload mid-run), jump to progress
  useEffect(() => {
    if (run.isDeleting && step !== "deleting") {
      if (!libraryId && run.progress.libraryId) setLibraryId(run.progress.libraryId);
      setStep("deleting");
    }
  }, [run.isDeleting, run.progress, step, libraryId]);

  const confirmDeletion = () => {
    setStep("deleting");
    run.start.mutate();
  };

  return (
    <div className="space-y-6">
      {step !== "game" && (
        <PageHeader
          title="Album Deleter"
          subtitle="Swipe through a library and move unwanted albums to the Trash — with a review step before anything is deleted."
        />
      )}

      {step === "setup" && (
        <DeleterSetupStep
          servers={servers}
          libraryId={libraryId}
          onLibraryChange={setLibraryId}
          onNext={() => setStep("game")}
        />
      )}

      {step === "game" && (
        <GameStep
          game={game}
          onDone={() => setStep("review")}
          onExit={() => setStep("setup")}
          rightAction={{ label: "Delete", Icon: Trash2, variant: "destructive" }}
          counterNoun="marked"
          doneSummary={(count) => `Done — review ${count} album${count === 1 ? "" : "s"}`}
        />
      )}

      {step === "review" && (
        <DeleteReviewStep
          libraryId={libraryId}
          onConfirm={confirmDeletion}
          onBack={() => setStep("game")}
        />
      )}

      {step === "deleting" && (
        <DeleteProgressStep run={run} onFinished={() => setStep("summary")} />
      )}

      {step === "summary" && (
        <DeleteSummaryStep
          progress={run.progress}
          onKeepSwiping={() => setStep("game")}
          onDone={() => setStep("setup")}
        />
      )}
    </div>
  );
}

export default AlbumDeleterPage;
