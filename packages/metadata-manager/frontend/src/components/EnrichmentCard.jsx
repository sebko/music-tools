import { useState } from "react";
import {
  MetadataRow,
  EditableGenresRow,
  Button,
} from "@dj-tools/my-component-library";
import { Check, AlertCircle, Loader } from "lucide-react";
import { applyEnrichment } from "../api/enrichment";

// Merge two genre lists into a deduped list (case-insensitive) preserving
// the order of the first list.
function mergeGenres(a = [], b = []) {
  const seen = new Set(a.map((g) => g.toLowerCase()));
  const out = [...a];
  for (const g of b) {
    if (!seen.has(g.toLowerCase())) {
      seen.add(g.toLowerCase());
      out.push(g);
    }
  }
  return out;
}

const CONFIDENCE_COLORS = {
  high: "bg-green-500",
  medium: "bg-amber-500",
  low: "bg-red-400",
};

const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/**
 * Card showing current vs proposed metadata for a single track.
 * Uses MetadataRow and GenreStylesRow from the shared component library
 * to match the music-tagger diff view style.
 *
 * @param {Object} props
 * @param {Object} props.result - Enrichment result with current/proposed/confidence
 * @param {string} props.inboxPath - Inbox root path (for display)
 * @param {Function} props.onApplied - Callback after successful apply
 */
export default function EnrichmentCard({ result, inboxPath, onApplied }) {
  const [selectedFields, setSelectedFields] = useState(() => {
    // Pre-select all fields that differ between current and proposed
    const selected = {};
    const { current, proposed } = result;
    if (proposed.artist && proposed.artist !== current.artist) selected.artist = true;
    if (proposed.title && proposed.title !== current.title) selected.title = true;
    if (proposed.label && proposed.label !== current.label) selected.label = true;
    if (proposed.year && proposed.year !== current.year) selected.year = true;
    if (proposed.bpm && proposed.bpm !== current.bpm) selected.bpm = true;
    if (proposed.initialKey && proposed.initialKey !== current.initialKey) selected.initialKey = true;
    return selected;
  });

  // Genres are managed separately from the checkbox-driven scalar fields
  // because the user picks them from multiple sources (Claude + last.fm)
  // and can type new ones. Default: union of Claude suggestions and
  // existing genres (last.fm is shown as an add-on the user opts into).
  const [selectedGenres, setSelectedGenres] = useState(() =>
    mergeGenres(result.proposed.genres || [], result.current.genres || []),
  );

  const [applyState, setApplyState] = useState("idle"); // idle | applying | applied | error
  const [applyError, setApplyError] = useState(null);

  const toggleField = (fieldName) => {
    setSelectedFields((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const handleApply = async () => {
    setApplyState("applying");
    setApplyError(null);

    const fields = {};
    if (selectedFields.artist) fields.artist = result.proposed.artist;
    if (selectedFields.title) fields.title = result.proposed.title;
    if (selectedFields.label) fields.label = result.proposed.label;
    if (selectedFields.year) fields.year = result.proposed.year;
    if (selectedFields.bpm) fields.bpm = result.proposed.bpm;
    if (selectedFields.initialKey) fields.initialKey = result.proposed.initialKey;

    // Always write whatever the user has assembled in the genre editor
    // — including the empty list, which clears genres on the track. Skip
    // only if unchanged from the file's current state.
    const currentGenresKey = JSON.stringify(
      (result.current.genres || []).map((g) => g.toLowerCase()).sort(),
    );
    const selectedGenresKey = JSON.stringify(
      selectedGenres.map((g) => g.toLowerCase()).sort(),
    );
    if (currentGenresKey !== selectedGenresKey) {
      fields.genre = selectedGenres;
    }

    try {
      await applyEnrichment(result.filePath, fields);
      setApplyState("applied");
      onApplied?.(result.filePath);
    } catch (err) {
      setApplyState("error");
      setApplyError(err.message);
    }
  };

  const { current, proposed, confidence } = result;
  const displayName = result.filePath.replace(inboxPath + "/", "");
  const currentGenresKey = JSON.stringify(
    (current.genres || []).map((g) => g.toLowerCase()).sort(),
  );
  const selectedGenresKey = JSON.stringify(
    selectedGenres.map((g) => g.toLowerCase()).sort(),
  );
  const genresChanged = currentGenresKey !== selectedGenresKey;
  const hasSelectedFields =
    Object.values(selectedFields).some(Boolean) || genresChanged;
  const isApplied = applyState === "applied";

  const genreSuggestions = [
    { source: "claude", label: "Claude", genres: proposed.genres || [] },
    {
      source: "lastgenre",
      label: "last.fm",
      genres: proposed.lastgenreGenres || [],
    },
  ].filter((s) => s.genres.length > 0);

  return (
    <div className="card-brutalist p-6 space-y-4">
      {/* Header: filename + confidence + Apply button */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-foreground truncate" title={displayName}>
            {displayName}
          </div>
          {proposed.proposedFilename && proposed.proposedFilename !== displayName && (
            <div className="font-mono text-xs text-foreground/50 truncate">
              → {proposed.proposedFilename}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-heading text-foreground/60">
            <span
              className={`w-2 h-2 rounded-full ${CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.low}`}
            />
            {CONFIDENCE_LABELS[confidence] || "Unknown confidence"}
          </span>
          {isApplied ? (
            <span className="text-xs font-heading text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Applied
            </span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApply}
              disabled={!hasSelectedFields || applyState === "applying"}
            >
              {applyState === "applying" ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Apply
            </Button>
          )}
        </div>
      </div>

      {/* Metadata comparison grid — matches music-tagger MatchMetadataPage */}
      <div className="grid grid-cols-[auto_auto_1fr_1fr] gap-x-4">
        {/* Super header row: Current vs Proposed */}
        <div />
        <div />
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2 mb-2 bg-background-secondary/50">
          Current
        </div>
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-main pb-2 mb-2 bg-main/5">
          Proposed
        </div>

        <MetadataRow label="Artist" leftValue={current.artist} rightValue={proposed.artist} fieldName="artist" selectedFields={selectedFields} toggleField={toggleField} />
        <MetadataRow label="Title" leftValue={current.title} rightValue={proposed.title} fieldName="title" selectedFields={selectedFields} toggleField={toggleField} />
        <MetadataRow label="Label" leftValue={current.label} rightValue={proposed.label} fieldName="label" selectedFields={selectedFields} toggleField={toggleField} />
        <MetadataRow label="Year" leftValue={current.year} rightValue={proposed.year} fieldName="year" selectedFields={selectedFields} toggleField={toggleField} />
        <MetadataRow label="BPM" leftValue={current.bpm} rightValue={proposed.bpm} fieldName="bpm" selectedFields={selectedFields} toggleField={toggleField} />
        <MetadataRow label="Key" leftValue={current.initialKey} rightValue={proposed.initialKey} fieldName="initialKey" selectedFields={selectedFields} toggleField={toggleField} />
        <EditableGenresRow
          label="Genres"
          currentGenres={current.genres || []}
          selectedGenres={selectedGenres}
          onChange={setSelectedGenres}
          suggestions={genreSuggestions}
        />
      </div>

      {applyState === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {applyError}
        </div>
      )}
    </div>
  );
}
