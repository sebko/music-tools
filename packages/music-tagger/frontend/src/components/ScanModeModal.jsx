import { useEffect, useState } from "react";
import { cn, Button } from "@dj-tools/my-component-library";

const SCAN_OPTIONS = [
  {
    value: "full",
    title: "Full Library Scan",
    description:
      "Scans your entire music library, rebuilding the database from your music files. Your music files are never modified.",
    highlight: true,
  },
];

function ScanModeModal({ isOpen, onClose, onConfirm, isStarting }) {
  const [selectedMode, setSelectedMode] = useState("full");

  useEffect(() => {
    if (isOpen) {
      setSelectedMode("full");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm(selectedMode);
  };

  return (
    <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="modal-brutalist max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b-2 border-border">
          <h2 className="text-xl font-heading text-foreground">
            Scan Music Library
          </h2>
          <p className="text-sm text-foreground/60 mt-1">
            This will scan your music library and rebuild the database.
          </p>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
          {SCAN_OPTIONS.map((option) => (
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
                name="scan-mode"
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

        {selectedMode === "full" && (
          <div className="mx-6 mb-4 px-4 py-3 bg-main/10 border-2 border-main rounded-base shadow-light text-sm text-foreground">
            <p className="font-heading">Note</p>
            <p className="mt-1">
              This will clear and rebuild your music database. Your music files are never modified or deleted.
            </p>
          </div>
        )}

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
            onClick={handleConfirm}
            variant="primary"
            size="sm"
            isDisabled={isStarting}
          >
            {isStarting ? "Starting..." : "Start Scan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ScanModeModal;
