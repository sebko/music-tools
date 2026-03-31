import { cn } from "../lib/utils";

/**
 * Visual tag badge component for displaying genre/style tags
 * @param {Object} props
 * @param {string} props.label - Tag text to display
 * @param {boolean} props.isNew - Whether this tag is new/different (highlights in main color)
 * @param {boolean} props.isRemoved - Whether this tag would be removed (highlights in red)
 */
export function TagPill({ label, isNew = false, isRemoved = false }) {
  return (
    <span
      className={cn(
        "inline-block rounded-base border-2 px-2 py-0.5 text-xs font-heading",
        isNew
          ? "bg-main/10 border-main"
          : isRemoved
            ? "bg-red-500/10 border-red-500"
            : "bg-background-secondary border-border"
      )}
    >
      {label}
    </span>
  );
}
