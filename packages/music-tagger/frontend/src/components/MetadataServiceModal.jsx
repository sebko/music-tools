import { useEffect, useState } from "react";
import { Button, ToggleGroup } from "@dj-tools/my-component-library";
import { METADATA_SERVICES } from "../constants/metadataServices";

function MetadataServiceModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Select Metadata Service",
  confirmText = "Start Search",
}) {
  // Single-select: default to 'redacted'
  const [selectedService, setSelectedService] = useState("redacted");

  useEffect(() => {
    if (isOpen) {
      // Reset to redacted when modal opens
      setSelectedService("redacted");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    // Pass single service wrapped in array for backwards compatibility
    onConfirm([selectedService]);
  };

  // Prepare options for ToggleGroup (only Redacted and MusicBrainz)
  const toggleOptions = METADATA_SERVICES.map(service => ({
    value: service.value,
    label: service.title
  }));

  return (
    <div
      className="fixed inset-0 bg-foreground/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="modal-brutalist max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b-2 border-border">
          <h2 className="text-xl font-heading text-foreground">{title}</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Choose which service to search for metadata
          </p>
        </div>

        <div className="px-6 py-6 flex justify-center">
          <ToggleGroup
            options={toggleOptions}
            value={selectedService}
            onChange={setSelectedService}
            size="md"
          />
        </div>

        <div className="px-6 py-4 border-t-2 border-border flex justify-end space-x-3">
          <Button onClick={onClose} variant="secondary" size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="primary"
            size="sm"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MetadataServiceModal;
