import { cn } from "../lib/utils";

/**
 * Generic toggle button group for filtering/tab selection
 * @param {string} activeFilter - Currently active filter key
 * @param {function} onFilterChange - Callback when filter changes
 * @param {Array<{key: string, label: string}>} filters - Filter options
 */
function FilterToggle({ activeFilter, onFilterChange, filters }) {

  return (
    <div className="inline-flex border-base rounded-base bg-background shadow-base overflow-hidden">
      {filters.map((filter, index) => {
        const isActive = activeFilter === filter.key;
        const isLast = index === filters.length - 1;

        return (
          <button
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            className={cn(
              // Base neo-brutalist styles
              "px-4 py-2 font-heading text-sm transition-all duration-200 min-h-[44px]",
              "flex items-center justify-center relative",

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
              "active:shadow-none active:translate-x-0 active:translate-y-0"
            )}
          >
            <span>{filter.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default FilterToggle;
