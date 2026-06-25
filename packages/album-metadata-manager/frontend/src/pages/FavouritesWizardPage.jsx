import { useEffect, useState } from "react";
import { PageHeader } from "@music-tools/my-component-library";
import { useFavouritesCopy, useFavouritesGame } from "../hooks/useFavouritesWizard";
import SetupStep from "../components/favourites/SetupStep";
import GameStep from "../components/favourites/GameStep";
import CopyProgressStep from "../components/favourites/CopyProgressStep";
import SummaryStep from "../components/favourites/SummaryStep";

// Wizard flow: setup (pick source/destination) -> game (swipe) -> copying -> summary.
// Source/destination are local to the wizard; the global active library is untouched.
function FavouritesWizardPage() {
  const [step, setStep] = useState("setup");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");

  const copy = useFavouritesCopy(sourceId, destId);
  const game = useFavouritesGame(sourceId, destId, { enabled: step === "game" });

  // If a copy is already running (e.g. page reload mid-copy), jump to progress
  useEffect(() => {
    if (copy.isCopying && step !== "copying") {
      if (!sourceId && copy.progress.sourceLibraryId) setSourceId(copy.progress.sourceLibraryId);
      if (!destId && copy.progress.destinationLibraryId) setDestId(copy.progress.destinationLibraryId);
      setStep("copying");
    }
  }, [copy.isCopying, copy.progress, step, sourceId, destId]);

  const startCopy = () => {
    setStep("copying");
    copy.start.mutate();
  };

  return (
    <div className="space-y-6">
      {step !== "game" && (
        <PageHeader
          title="Favourites Wizard"
          subtitle="Swipe through a source library and copy your favourite albums to another library."
        />
      )}

      {step === "setup" && (
        <SetupStep
          sourceId={sourceId}
          destId={destId}
          onSourceChange={setSourceId}
          onDestChange={setDestId}
          onNext={() => setStep("game")}
        />
      )}

      {step === "game" && (
        <GameStep game={game} onDone={startCopy} onExit={() => setStep("setup")} />
      )}

      {step === "copying" && (
        <CopyProgressStep copy={copy} onFinished={() => setStep("summary")} />
      )}

      {step === "summary" && (
        <SummaryStep
          progress={copy.progress}
          onKeepSwiping={() => setStep("game")}
          onDone={() => setStep("setup")}
        />
      )}
    </div>
  );
}

export default FavouritesWizardPage;
