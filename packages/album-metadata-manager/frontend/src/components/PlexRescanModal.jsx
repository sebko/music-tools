import { useEffect, useState } from "react";
import { cn, Button } from "@music-tools/my-component-library";

const RESCAN_OPTIONS = [
  {
    value: "delta",
    title: "Delta rescan (recommended)",
    description:
      "Only re-reads albums that changed in Plex since the last scan. Fast — skips the per-album detail, artwork, and metadata work for everything unchanged.",
    highlight: true,
  },
  {
    value: "full",
    title: "Full rescan",
    description:
      "Re-reads every album from Plex. Slower, but rebuilds artwork dimensions and recovers from drift. Your music files are never modified.",
    highlight: false,
  },
];

function PlexRescanModal({ isOpen, onClose, onStart, isStarting }) {
  const [selectedMode, setSelectedMode] = useState("delta");

  // Reset to the recommended default each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSelectedMode("delta");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleStart = () => {
    onStart({ force: selectedMode === "full" });
  };

  return (
    <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="modal-brutalist max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b-2 border-border">
          <h2 className="text-xl font-heading text-foreground">Plex rescan</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Choose how thoroughly to re-read your Plex library into the app.
          </p>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
          {RESCAN_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-start space-x-3 p-3 rounded-base border-2 cursor-pointer transition-all",
                selectedMode === option.value
                  ? "border-main bg-main/10 shadow-light"
                  : "border-border hover:border-main/50 hover:shadow-light"
              )}
            >
              <input
                type="radio"
                name="rescan-mode"
                value={option.value}
                checked={selectedMode === option.value}
                onChange={() => setSelectedMode(option.value)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-heading text-foreground">
                  {option.title}
                </p>
                <p className="text-sm text-foreground/60 mt-1">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="px-6 py-4 bg-background-secondary flex justify-end space-x-3 rounded-b-base border-t-2 border-border">
          <Button
            onClick={onClose}
            variant="default"
            size="sm"
            isDisabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            variant="primary"
            size="sm"
            isDisabled={isStarting}
          >
            {isStarting ? "Starting..." : "Start"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlexRescanModal;
