import { cn } from "../lib/utils";

/**
 * Generic single-select toggle button group (radio button behavior)
 * Based on FilterToggle pattern with neo-brutalist styling
 *
 * @param {Object} props
 * @param {Array<{value: string, label: string}>} props.options - Array of options
 * @param {string} props.value - Currently selected value
 * @param {Function} props.onChange - Callback when selection changes (value) => void
 * @param {string} [props.size] - Size variant: "sm" | "md" | "lg"
 * @param {string} [props.className] - Additional classes for the container
 */
function ToggleGroup({ options, value, onChange, size = "md", className }) {
  return (
    <div className={cn(
      "inline-flex border-base rounded-base bg-background shadow-base overflow-hidden",
      className
    )}>
      {options.map((option, index) => {
        const isActive = value === option.value;
        const isLast = index === options.length - 1;

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              // Base neo-brutalist styles
              "font-heading transition-all duration-200",
              "flex items-center justify-center relative",

              // Size variants
              {
                "px-3 py-1.5 text-sm min-h-[44px]": size === "sm",
                "px-4 py-2 text-sm min-h-[44px]": size === "md",
                "px-6 py-3 text-base min-h-[48px]": size === "lg",
              },

              // Border handling - only add right border if not last
              !isLast && "border-r border-border",

              // Active/inactive states
              isActive && [
                "bg-main text-main-foreground shadow-heavy",
                "-translate-x-0.5 -translate-y-0.5 z-10"
              ],
              !isActive && [
                "bg-background text-foreground hover:bg-background-secondary",
                "hover:shadow-light hover:-translate-x-0.5 hover:-translate-y-0.5"
              ],

              // Active state overrides hover
              "active:shadow-none active:translate-x-0 active:translate-y-0",

              // Focus styles for accessibility
              "focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2"
            )}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ToggleGroup;
