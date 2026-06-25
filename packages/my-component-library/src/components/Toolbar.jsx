import { cn } from "../lib/utils";

/**
 * Horizontal flex container with left/right slots for filter/action toolbars
 * @param {Object} props
 * @param {React.ReactNode} [props.left] - Left-aligned content (filters)
 * @param {React.ReactNode} [props.right] - Right-aligned content (actions, search)
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children] - Alternative to left/right for custom layout
 */
function Toolbar({ left, right, className, children }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      {children || (
        <>
          <div className="flex flex-wrap items-center gap-3">{left}</div>
          <div className="flex flex-wrap items-center gap-3">{right}</div>
        </>
      )}
    </div>
  );
}

export default Toolbar;
