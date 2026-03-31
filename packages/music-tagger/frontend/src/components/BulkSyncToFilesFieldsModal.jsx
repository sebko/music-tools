import { useState } from "react";
import { Modal, Button } from "@dj-tools/my-component-library";
import {
  PLEX_TO_FILE_SYNCABLE_FIELDS,
  getDefaultPlexToFileFieldSelection,
} from "../constants/plexToFileSyncableFields";

/**
 * Modal for selecting which metadata fields to sync during bulk Plex→File sync
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed/cancelled
 * @param {function} onStartSync - Called with selectedFields when user clicks Sync
 * @param {number} unsyncedCount - Number of unsynced albums that will be synced
 * @param {boolean} isStarting - Whether sync is currently starting
 */
function BulkSyncToFilesFieldsModal({
  isOpen,
  onClose,
  onStartSync,
  unsyncedCount = 0,
  isStarting = false,
}) {
  const [selectedFields, setSelectedFields] = useState(
    getDefaultPlexToFileFieldSelection
  );

  const toggleField = (key) => {
    // Only allow toggling implemented fields
    const field = PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === key);
    if (!field?.implemented) return;
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllImplemented = () => {
    const allSelected = {};
    PLEX_TO_FILE_SYNCABLE_FIELDS.forEach((f) => {
      allSelected[f.key] = f.implemented;
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
  const notImplementedFields = PLEX_TO_FILE_SYNCABLE_FIELDS.filter(
    (f) => !f.implemented
  );

  const hasAnySelected = Object.values(selectedFields).some((v) => v);
  const selectedCount = Object.values(selectedFields).filter((v) => v).length;

  const handleStartSync = () => {
    onStartSync(selectedFields);
  };

  // Reset selection when modal closes
  const handleClose = () => {
    setSelectedFields(getDefaultPlexToFileFieldSelection());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-md"
      closeOnBackdropClick={!isStarting}
      className="p-6"
    >
      <div className="mb-4">
        <h2 className="text-xl font-heading text-foreground mb-2">
          Bulk Sync to Files
        </h2>
        <p className="text-sm text-foreground/60">
          Write Plex metadata to local file tags for{" "}
          <span className="font-heading text-foreground">
            {unsyncedCount} unsynced albums
          </span>
          .
        </p>
      </div>

      {/* Select All / Deselect All */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={selectAllImplemented}
          variant="secondary"
          size="xs"
          isDisabled={isStarting}
        >
          Select All
        </Button>
        <Button
          onClick={deselectAll}
          variant="secondary"
          size="xs"
          isDisabled={isStarting}
        >
          Deselect All
        </Button>
      </div>

      {/* Implemented Field Checkboxes */}
      <div className="space-y-2 mb-4">
        {implementedFields.map((field) => (
          <label
            key={field.key}
            className="flex items-center gap-3 p-3 rounded-base border-2 border-border hover:border-main/50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedFields[field.key] || false}
              onChange={() => toggleField(field.key)}
              disabled={isStarting}
              className="w-4 h-4 accent-main"
            />
            <div className="flex-1">
              <span className="font-heading text-foreground text-sm">
                {field.label}
              </span>
              <span className="text-foreground/50 text-xs ml-2">
                {field.description}
              </span>
            </div>
          </label>
        ))}
      </div>

      {/* Not Implemented Fields (disabled) */}
      {notImplementedFields.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-foreground/40 mb-2">
            Not yet implemented:
          </p>
          <div className="space-y-2 opacity-50">
            {notImplementedFields.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-3 p-3 rounded-base border-2 border-border/50 cursor-not-allowed"
              >
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="w-4 h-4 accent-main"
                />
                <div className="flex-1">
                  <span className="font-heading text-foreground/60 text-sm">
                    {field.label}
                  </span>
                  <span className="text-foreground/40 text-xs ml-2">
                    {field.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

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
          isDisabled={isStarting}
        >
          Cancel
        </Button>
        <Button
          onClick={handleStartSync}
          variant="primary"
          size="sm"
          isDisabled={!hasAnySelected || isStarting}
          isLoading={isStarting}
        >
          {isStarting ? "Starting..." : "Sync"}
        </Button>
      </div>
    </Modal>
  );
}

export default BulkSyncToFilesFieldsModal;
