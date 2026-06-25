import { cn } from "../lib/utils";

/**
 * Small overlay badge for cards and images
 * @param {Object} props
 * @param {'success'|'info'|'warning'|'accent'} [props.variant='info']
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'} [props.position='top-left']
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
function Badge({ variant = "info", position = "top-left", className, children }) {
  return (
    <span
      className={cn(
        "absolute z-10 px-1.5 py-0.5 rounded-sm text-[10px] font-bold tracking-wide text-white border backdrop-blur-sm",
        {
          "bg-green-600/90 border-green-600/30": variant === "success",
          "bg-blue-600/90 border-blue-600/30": variant === "info",
          "bg-amber-500/90 border-amber-500/30": variant === "warning",
          "bg-purple-600/90 border-purple-600/30": variant === "accent",
        },
        {
          "top-2 left-2": position === "top-left",
          "top-2 right-2": position === "top-right",
          "bottom-2 left-2": position === "bottom-left",
          "bottom-2 right-2": position === "bottom-right",
        },
        className
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
