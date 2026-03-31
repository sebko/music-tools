import { useState, useEffect } from "react";
import { Modal, Button } from "@dj-tools/my-component-library";
import {
  PLEX_TO_FILE_SYNCABLE_FIELDS,
  getDefaultPlexToFileFieldSelection,
} from "../constants/plexToFileSyncableFields";

/**
 * Modal for selecting which Plex metadata fields to sync to local file tags
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed/cancelled
 * @param {function} onStartSync - Called with selectedFields when user clicks Sync
 * @param {string} albumTitle - Album title for display
 * @param {boolean} isSyncing - Whether sync is currently in progress
 */
function SyncToFilesFieldsModal({
  isOpen,
  onClose,
  onStartSync,
  albumTitle = "",
  isSyncing = false,
}) {
  const [selectedFields, setSelectedFields] = useState(
    getDefaultPlexToFileFieldSelection
  );

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFields(getDefaultPlexToFileFieldSelection());
    }
  }, [isOpen]);

  const toggleField = (key, implemented) => {
    if (!implemented) return; // Can't toggle unimplemented fields
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    const allSelected = {};
    PLEX_TO_FILE_SYNCABLE_FIELDS.forEach((f) => {
      allSelected[f.key] = f.implemented; // Only select implemented fields
    });
    setSelectedFields(allSelected);
  };

  const deselectAll = () => {
    const allDeselected = {};
    PLEX_TO_FILE_SYNCABLE_FIELDS.forEach((f) => (allDeselected[f.key] = false));
    setSelectedFields(allDeselected);
  };

  const implementedFields = PLEX_TO_FILE_SYNCABLE_FIELDS.filter(
    (f) => f.implemented
  );
  const hasAnySelected = Object.values(selectedFields).some((v) => v);
  const selectedCount = Object.values(selectedFields).filter((v) => v).length;

  const handleStartSync = () => {
    onStartSync(selectedFields);
  };

  const handleClose = () => {
    setSelectedFields(getDefaultPlexToFileFieldSelection());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-md"
      closeOnBackdropClick={!isSyncing}
      className="p-6"
    >
      <div className="mb-4">
        <h2 className="text-xl font-heading text-foreground mb-2">
          Sync to Files
        </h2>
        <p className="text-sm text-foreground/60">
          Write Plex metadata to local file tags for{" "}
          <span className="font-heading text-foreground">{albumTitle}</span>
        </p>
      </div>

      {/* Select All / Deselect All */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={selectAll}
          variant="secondary"
          size="xs"
          isDisabled={isSyncing}
        >
          Select All
        </Button>
        <Button
          onClick={deselectAll}
          variant="secondary"
          size="xs"
          isDisabled={isSyncing}
        >
          Deselect All
        </Button>
      </div>

      {/* Field Checkboxes */}
      <div className="space-y-2 mb-6">
        {PLEX_TO_FILE_SYNCABLE_FIELDS.map((field) => (
          <label
            key={field.key}
            className={`flex items-center gap-3 p-3 rounded-base border-2 transition-colors ${
              field.implemented
                ? "border-border hover:border-main/50 cursor-pointer"
                : "border-border/50 cursor-not-allowed opacity-50"
            }`}
            title={field.implemented ? undefined : "Coming soon"}
          >
            <input
              type="checkbox"
              checked={selectedFields[field.key] || false}
              onChange={() => toggleField(field.key, field.implemented)}
              disabled={isSyncing || !field.implemented}
              className="w-4 h-4 accent-main"
            />
            <div className="flex-1">
              <span className="font-heading text-foreground text-sm">
                {field.label}
              </span>
              {!field.implemented && (
                <span className="text-xs text-foreground/40 ml-2 italic">
                  (coming soon)
                </span>
              )}
              <span className="text-foreground/50 text-xs ml-2 block sm:inline">
                {field.description}
              </span>
            </div>
          </label>
        ))}
      </div>

      {/* Selected Count Summary */}
      <div className="mb-4 text-sm text-foreground/60">
        {selectedCount} of {implementedFields.length} available fields selected
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <Button
          onClick={handleClose}
          variant="secondary"
          size="sm"
          isDisabled={isSyncing}
        >
          Cancel
        </Button>
        <Button
          onClick={handleStartSync}
          variant="primary"
          size="sm"
          isDisabled={!hasAnySelected || isSyncing}
          isLoading={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync to Files"}
        </Button>
      </div>
    </Modal>
  );
}

export default SyncToFilesFieldsModal;
