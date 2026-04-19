import { TagPill } from "@dj-tools/my-component-library";

/**
 * Read-only metadata row for displaying tag arrays (genres, styles)
 * Used for informational display without sync functionality
 * Displays values in the right (Remote/Plex) column
 *
 * @param {Object} props
 * @param {string} props.label - Row label (e.g., "Genre", "Style")
 * @param {string[]} props.values - Array of tag values to display (Plex data)
 */
export function InfoTagRow({ label, values }) {
  const sorted = [...(values || [])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return (
    <>
      {/* Empty checkbox column */}
      <div className="flex items-center py-2">
        <div className="w-4 h-4" />
      </div>
      {/* Label */}
      <div className="font-heading text-foreground/60 text-sm py-2">{label}</div>
      {/* Empty left column (Local/File) */}
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border/50 bg-background-secondary/30">
        <span className="text-foreground/40">-</span>
      </div>
      {/* Values - right column (Remote/Plex) */}
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border/50 bg-background-secondary/30">
        {sorted.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {sorted.map((tag, index) => (
              <TagPill key={index} label={tag} isNew={false} />
            ))}
          </div>
        ) : (
          <span className="text-foreground/40">-</span>
        )}
      </div>
    </>
  );
}
