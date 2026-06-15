import { useState } from "react";
import { Modal, Button } from "@music-tools/my-component-library";
import {
  SYNCABLE_FIELDS,
  getDefaultFieldSelection,
} from "../constants/syncableFields";

/**
 * Modal for selecting which metadata fields to sync during bulk sync
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal is closed/cancelled
 * @param {function} onStartSync - Called with selectedFields when user clicks Sync
 * @param {number} matchedCount - Number of matched albums that will be synced
 * @param {boolean} isStarting - Whether sync is currently starting
 */
function BulkSyncFieldsModal({
  isOpen,
  onClose,
  onStartSync,
  matchedCount = 0,
  isStarting = false,
}) {
  const [selectedFields, setSelectedFields] = useState(getDefaultFieldSelection);

  const toggleField = (key) => {
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    const allSelected = {};
    SYNCABLE_FIELDS.forEach((f) => (allSelected[f.key] = true));
    setSelectedFields(allSelected);
  };

  const deselectAll = () => {
    const allDeselected = {};
    SYNCABLE_FIELDS.forEach((f) => (allDeselected[f.key] = false));
    setSelectedFields(allDeselected);
  };

  const hasAnySelected = Object.values(selectedFields).some((v) => v);
  const selectedCount = Object.values(selectedFields).filter((v) => v).length;

  const handleStartSync = () => {
    onStartSync(selectedFields);
  };

  // Reset selection when modal closes
  const handleClose = () => {
    setSelectedFields(getDefaultFieldSelection());
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
          Bulk Sync to Plex
        </h2>
        <p className="text-sm text-foreground/60">
          Select which metadata fields to sync from Redacted matches to Plex for{" "}
          <span className="font-heading text-foreground">
            {matchedCount} matched albums
          </span>
          .
        </p>
      </div>

      {/* Select All / Deselect All */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={selectAll}
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

      {/* Field Checkboxes */}
      <div className="space-y-2 mb-6">
        {SYNCABLE_FIELDS.map((field) => (
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

      {/* Selected Count Summary */}
      <div className="mb-4 text-sm text-foreground/60">
        {selectedCount} of {SYNCABLE_FIELDS.length} fields selected
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

export default BulkSyncFieldsModal;
