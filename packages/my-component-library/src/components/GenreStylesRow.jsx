import { cn } from "../lib/utils";
import { TagPill } from "./TagPill";

/**
 * Metadata comparison row for array values (genres, styles, tags)
 * Displays tag pills with highlighting for new/different tags
 *
 * @param {Object} props
 * @param {string} props.label - Row label (e.g., "Genre", "Styles")
 * @param {string[]} props.leftValues - Array of values in left column (source)
 * @param {string[]} props.rightValues - Array of values in right column (target)
 * @param {string} props.fieldName - Field key for checkbox state
 * @param {Object} props.selectedFields - Object mapping fieldNames to boolean selected state
 * @param {Function} props.toggleField - Callback to toggle field selection
 * @param {boolean} props.disabled - Whether the checkbox should be disabled
 * @param {boolean} props.isSynced - Whether this field was already synced (shows checked+disabled)
 * @param {boolean} props.additive - When true, syncing MERGES the right values into
 *   the left (a union) rather than replacing them. Left tags are therefore never
 *   "lost", so they're not flagged as removed, and the only meaningful difference is
 *   whether the right side contributes new tags. Use for merge-semantics syncs
 *   (e.g. Plex → file genre tags); leave false for replace-semantics syncs.
 */
export function GenreStylesRow({
  label,
  leftValues,
  rightValues,
  fieldName,
  selectedFields,
  toggleField,
  disabled = false,
  isSynced = false,
  additive = false,
}) {
  const leftArray = leftValues || [];
  const rightArray = rightValues || [];

  // Create sets for bidirectional comparison (case-insensitive)
  const leftSet = new Set(leftArray.map((v) => v.toLowerCase()));
  const rightSet = new Set(rightArray.map((v) => v.toLowerCase()));

  // Sort both arrays alphabetically (case-insensitive)
  const sortedLeft = [...leftArray].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  const sortedRight = [...rightArray].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // Left pills: mark as "removed" if NOT in right set (would be lost if syncing).
  // In additive (merge) mode nothing on the left is ever lost, so never flag it.
  const leftPills = sortedLeft.map((tag) => ({
    label: tag,
    isRemoved: !additive && !rightSet.has(tag.toLowerCase()),
  }));

  // Right pills: mark as "new" if NOT in left set (would be gained if syncing)
  const rightPills = sortedRight.map((tag) => ({
    label: tag,
    isNew: !leftSet.has(tag.toLowerCase()),
  }));

  // Check if there are differences worth syncing. In additive mode that means the
  // right side brings tags the left doesn't have; otherwise any change either way.
  const hasDifferences = additive
    ? rightPills.some((p) => p.isNew)
    : leftPills.some((p) => p.isRemoved) || rightPills.some((p) => p.isNew);

  // Show checkbox if:
  // - Field was already synced (show checked+disabled), OR
  // - Field can be synced (has fieldName, has differences, not disabled)
  const showCheckbox = fieldName && (isSynced || (hasDifferences && !disabled));

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
          <div className="w-4 h-4" />
        )}
      </div>
      <div className="font-heading text-foreground text-sm py-2">{label}</div>
      <div
        className={cn(
          "text-foreground text-sm py-2 px-3 rounded-base border-2",
          leftPills.some((p) => p.isRemoved)
            ? "border-red-500 bg-red-500/5"
            : "border-border"
        )}
      >
        {sortedLeft.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {leftPills.map((pill, index) => (
              <TagPill key={index} label={pill.label} isRemoved={pill.isRemoved} />
            ))}
          </div>
        ) : (
          "-"
        )}
      </div>
      <div
        className={cn(
          "text-foreground text-sm py-2 px-3 rounded-base border-2",
          rightPills.some((p) => p.isNew)
            ? "border-main bg-main/5"
            : "border-border"
        )}
      >
        {sortedRight.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {rightPills.map((pill, index) => (
              <TagPill key={index} label={pill.label} isNew={pill.isNew} />
            ))}
          </div>
        ) : (
          "-"
        )}
      </div>
    </>
  );
}
