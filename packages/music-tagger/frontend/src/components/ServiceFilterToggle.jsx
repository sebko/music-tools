import { ToggleGroup } from "@dj-tools/my-component-library";
import { METADATA_SERVICES } from "../constants/metadataServices";

/**
 * Single-select service filter with toggle button UI
 * Shows only Redacted or MusicBrainz (no "All" option)
 */
function ServiceFilterToggle({ selectedService, onServiceChange }) {
  // Prepare options for ToggleGroup
  const toggleOptions = METADATA_SERVICES.map(service => ({
    value: service.value,
    label: service.title
  }));

  // Default to 'redacted' if no service selected
  const currentService = selectedService || 'redacted';

  return (
    <ToggleGroup
      options={toggleOptions}
      value={currentService}
      onChange={onServiceChange}
      size="md"
    />
  );
}

export default ServiceFilterToggle;
