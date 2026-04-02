import { Search, X } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Search input with icon and clear button
 * @param {Object} props
 * @param {string} props.value - Current input value
 * @param {function} props.onChange - (value: string) => void
 * @param {function} [props.onSubmit] - Called on form submit / Enter key
 * @param {function} [props.onClear] - Called when clear button is clicked
 * @param {string} [props.placeholder='Search...']
 * @param {string} [props.className]
 */
function SearchInput({ value, onChange, onSubmit, onClear, placeholder = "Search...", className }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(value);
  };

  const handleClear = () => {
    onChange("");
    onClear?.();
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-brutalist pl-10 pr-8 w-full"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}

export default SearchInput;
