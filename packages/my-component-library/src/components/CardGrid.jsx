import { cn } from "../lib/utils";

/**
 * Responsive grid container for media cards
 * @param {Object} props
 * @param {'compact'|'default'|'relaxed'} [props.density='default']
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
function CardGrid({ density = "default", className, children }) {
  return (
    <div
      className={cn(
        "grid",
        {
          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-10 gap-4":
            density === "compact",
          "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8 gap-6":
            density === "default",
          "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8":
            density === "relaxed",
        },
        className
      )}
    >
      {children}
    </div>
  );
}

export default CardGrid;
