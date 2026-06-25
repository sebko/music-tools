/**
 * Metadata comparison row component for scalar values
 * Displays a label with checkbox and two value columns (left/right comparison)
 * Automatically detects differences between values and highlights them
 *
 * @param {Object} props
 * @param {string} props.label - Row label (e.g., "Album", "Year")
 * @param {string|number} props.leftValue - Value in left column (source)
 * @param {string|number} props.rightValue - Value in right column (target)
 * @param {string} props.fieldName - Field key for checkbox state
 * @param {Object} props.selectedFields - Object mapping fieldNames to boolean selected state
 * @param {Function} props.toggleField - Callback to toggle field selection
 * @param {boolean} props.disabled - Whether the checkbox should be disabled
 * @param {boolean} props.isSynced - Whether this field was already synced (shows checked+disabled)
 */
export function MetadataRow({
  label,
  leftValue,
  rightValue,
  fieldName,
  selectedFields,
  toggleField,
  disabled = false,
  isSynced = false,
}) {
  // Normalize values for comparison
  // Treat null, undefined, empty string, and '-' as equivalent "no value"
  const normalizeValue = (val) => {
    if (val === null || val === undefined || val === "" || val === "-")
      return null;
    return String(val).trim();
  };

  const normalizedLeft = normalizeValue(leftValue);
  const normalizedRight = normalizeValue(rightValue);

  // Auto-detect if values differ
  // Only highlight if BOTH sides hold a real value AND they're different.
  // Empty proposed → no highlight + no checkbox: there's nothing to apply,
  // so it'd be misleading to render the cell as "selected".
  const isDifferent =
    normalizedLeft !== null &&
    normalizedRight !== null &&
    normalizedLeft !== normalizedRight;

  // Show checkbox if:
  // - Field was already synced (show checked+disabled), OR
  // - Field can be synced (has fieldName, values differ, not disabled)
  const showCheckbox = fieldName && (isSynced || (isDifferent && !disabled));

  return (
    <>
      <div className="flex items-center py-2">
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={isSynced || (selectedFields?.[fieldName] || false)}
            onChange={() => !isSynced && toggleField?.(fieldName)}
            disabled={isSynced}
            className="w-4 h-4 accent-main disabled:opacity-50"
            title={isSynced ? "Already synced" : undefined}
          />
        ) : (
          <div className="w-4 h-4" /> // Spacer for rows without checkbox
        )}
      </div>
      <div className="font-heading text-foreground text-sm py-2">{label}</div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {leftValue || "-"}
      </div>
      <div
        className={`text-foreground text-sm py-2 px-3 rounded-base border-2 ${
          isDifferent ? "border-main bg-main/5" : "border-border"
        }`}
      >
        {rightValue || "-"}
      </div>
    </>
  );
}
