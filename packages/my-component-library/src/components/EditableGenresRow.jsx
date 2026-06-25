import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * Editable genre editor for combining multiple suggestion sources.
 *
 * Renders selected genres as removable pills plus one row per suggestion
 * source (e.g. Claude, last.fm) whose pills are click-to-add. Also supports
 * freehand typed entries. Dedupe is case-insensitive; display form is
 * Title Case. Emits the final, ordered list via `onChange` whenever the
 * selection changes.
 *
 * Fits the 4-column grid used by MetadataRow / GenreStylesRow:
 *     [checkbox] [label] [left column] [right column]
 *
 * Left column is read-only (existing/current genres). Right column is the
 * editable selection, with the suggestion rows and input stacked below.
 *
 * @param {Object} props
 * @param {string} props.label - Row label (default "Genres")
 * @param {string[]} props.currentGenres - Existing genres on the track
 * @param {string[]} props.selectedGenres - Currently-selected genres (controlled)
 * @param {Function} props.onChange - (nextGenres: string[]) => void
 * @param {Array<{source: string, label?: string, genres: string[]}>} props.suggestions
 *     One entry per suggestion source. `label` defaults to a title-cased
 *     `source` string.
 * @param {string} [props.fieldName] - Field key for opt-in/out checkbox
 * @param {Object} [props.selectedFields] - Map of fieldName → boolean checked
 * @param {Function} [props.toggleField] - Callback to toggle the checkbox
 */
export function EditableGenresRow({
  label = "Genres",
  currentGenres = [],
  selectedGenres = [],
  onChange,
  suggestions = [],
  fieldName,
  selectedFields,
  toggleField,
}) {
  const [inputValue, setInputValue] = useState("");

  // Normalize for case-insensitive dedupe.
  const key = (s) => String(s).trim().toLowerCase();
  const selectedKeys = new Set(selectedGenres.map(key));
  const currentKeys = new Set(currentGenres.map(key));

  const titleCase = (s) =>
    String(s)
      .trim()
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");

  const addGenre = (raw) => {
    const trimmed = String(raw).trim();
    if (!trimmed) return;
    if (selectedKeys.has(key(trimmed))) return;
    onChange?.([...selectedGenres, titleCase(trimmed)]);
  };

  const removeGenre = (g) => {
    const k = key(g);
    onChange?.(selectedGenres.filter((x) => key(x) !== k));
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (inputValue.trim()) {
        addGenre(inputValue);
        setInputValue("");
      }
    } else if (e.key === "Backspace" && !inputValue && selectedGenres.length > 0) {
      removeGenre(selectedGenres[selectedGenres.length - 1]);
    }
  };

  // Flatten every suggested genre (across sources) into a set so the "Add all"
  // action lives above the source rows.
  const allSuggested = [];
  const seen = new Set();
  for (const s of suggestions) {
    for (const g of s.genres || []) {
      if (!seen.has(key(g))) {
        seen.add(key(g));
        allSuggested.push(g);
      }
    }
  }
  const unaddedSuggestions = allSuggested.filter((g) => !selectedKeys.has(key(g)));

  return (
    <>
      {/* Checkbox column — opt in/out of writing the selected genres */}
      <div className="flex items-center py-2">
        {fieldName ? (
          <input
            type="checkbox"
            checked={selectedFields?.[fieldName] || false}
            onChange={() => toggleField?.(fieldName)}
            className="w-4 h-4 accent-main"
          />
        ) : (
          <div className="w-4 h-4" />
        )}
      </div>
      <div className="font-heading text-foreground text-sm py-2">{label}</div>

      {/* Left column: current genres, read-only */}
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {currentGenres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {currentGenres.map((g) => (
              <span
                key={g}
                className="inline-block rounded-base border-2 border-border bg-background-secondary px-2 py-0.5 text-xs font-heading"
              >
                {g}
              </span>
            ))}
          </div>
        ) : (
          "-"
        )}
      </div>

      {/* Right column: editable selection + suggestions + input */}
      <div className="text-foreground text-sm py-2 px-3 rounded-base border-2 border-main bg-main/5 space-y-2">
        {/* Selected pills */}
        <div className="flex flex-wrap gap-1">
          {selectedGenres.length === 0 ? (
            <span className="text-foreground/40 text-xs italic">
              No genres selected
            </span>
          ) : (
            selectedGenres.map((g) => {
              const isNew = !currentKeys.has(key(g));
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => removeGenre(g)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-base border-2 px-2 py-0.5 text-xs font-heading transition-colors",
                    isNew
                      ? "border-main bg-main/10 hover:bg-main/20"
                      : "border-border bg-background-secondary hover:border-main/60",
                  )}
                  title={isNew ? "New — click to remove" : "Already on track — click to remove"}
                >
                  {g}
                  <span aria-hidden className="text-foreground/60">×</span>
                </button>
              );
            })
          )}
        </div>

        {/* Source suggestion rows */}
        {suggestions.map((src) => {
          const pills = (src.genres || []).filter(Boolean);
          if (pills.length === 0) return null;
          return (
            <div key={src.source} className="flex flex-wrap items-center gap-1">
              <span className="text-xs font-heading text-foreground/50 uppercase tracking-wide mr-1">
                {src.label || titleCase(src.source)}:
              </span>
              {pills.map((g) => {
                const isSelected = selectedKeys.has(key(g));
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => (isSelected ? removeGenre(g) : addGenre(g))}
                    className={cn(
                      "inline-block rounded-base border-2 px-2 py-0.5 text-xs font-heading transition-colors",
                      isSelected
                        ? "border-main bg-main/20 line-through opacity-60"
                        : "border-border bg-background-secondary hover:border-main hover:bg-main/10",
                    )}
                    title={isSelected ? "Already selected" : "Click to add"}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          );
        })}

        {unaddedSuggestions.length > 1 && (
          <button
            type="button"
            onClick={() => {
              const next = [...selectedGenres];
              for (const g of unaddedSuggestions) {
                if (!next.some((x) => key(x) === key(g))) next.push(titleCase(g));
              }
              onChange?.(next);
            }}
            className="text-xs font-heading text-main hover:underline"
          >
            + Add all suggestions
          </button>
        )}

        {/* Free-text input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addGenre(inputValue);
              setInputValue("");
            }
          }}
          placeholder="Type a genre and press Enter…"
          className="w-full bg-transparent border-b border-border px-1 py-1 text-xs font-mono text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-main"
        />
      </div>
    </>
  );
}
