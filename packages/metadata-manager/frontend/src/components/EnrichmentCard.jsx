import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  MetadataRow,
  EditableGenresRow,
  Button,
} from "@dj-tools/my-component-library";
import { Check, AlertCircle, Loader, Sparkles } from "lucide-react";
import { applyEnrichment, fetchClaudeForTrack } from "../api/enrichment";

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

// Scalar field checkboxes start unchecked — the user opts in to each.
// Only the genre row defaults to selected, since it's pre-populated from
// last.fm and (after AI scan) Claude, so most users will want it written.
function defaultSelection() {
  return { genre: true };
}

/**
 * Card showing current vs proposed metadata for a single track.
 * Uses MetadataRow and GenreStylesRow from the shared component library
 * to match the music-tagger diff view style.
 *
 * Default proposed state comes from last.fm only (see trackEnrichmentService
 * — auto-Claude is disabled to save tokens). The "AI genre scan" button
 * below the genre row triggers a single-track Claude call that fills in the
 * rest of the proposed fields and merges Claude's genres into the pill list.
 *
 * @param {Object} props
 * @param {Object} props.result - Enrichment result with current/proposed/confidence
 * @param {string} [props.operationId] - Inbox import operation ID (legacy inbox flow)
 * @param {string} [props.inboxPath] - Inbox root path used to shorten the display name
 * @param {Function} [props.onClaudeScan] - (filePath) => { proposed, confidence }.
 *     When provided, used instead of the inbox-bound fetchClaudeForTrack so the
 *     card works outside the inbox flow (album bulk match, future library scan).
 * @param {Function} [props.onApplied] - Callback after successful apply
 * @param {Object} [props.initialAiScanned] - { proposed, confidence } from an
 *     orchestrator that ran the Claude scan upfront. When provided, the card
 *     mounts with `AI scanned` already showing and Claude's genres pre-merged.
 */
const EnrichmentCard = forwardRef(function EnrichmentCard(
  { result, operationId, inboxPath, onClaudeScan, onApplied, initialAiScanned },
  ref,
) {
  // idle | loading | loaded | error. Seeded to "loaded" if an upstream
  // orchestrator (e.g. BulkGenreMatchStepper eager mode) already ran Claude.
  const [aiState, setAiState] = useState(() =>
    initialAiScanned ? "loaded" : "idle",
  );
  const [aiResult, setAiResult] = useState(() =>
    initialAiScanned ? initialAiScanned.proposed : null,
  );
  const [aiError, setAiError] = useState(null);

  const displayedProposed = aiResult ?? result.proposed;

  const [selectedFields, setSelectedFields] = useState(() => defaultSelection());

  // Default: merge last.fm suggestions into the current genre list so the
  // user's baseline selection already includes what last.fm proposed. If an
  // upstream orchestrator pre-ran Claude, merge its genres on top too — same
  // shape as a successful in-card scan.
  const [selectedGenres, setSelectedGenres] = useState(() => {
    const base = mergeGenres(
      result.current.genres || [],
      result.proposed.lastgenreGenres || [],
    );
    return initialAiScanned
      ? mergeGenres(base, initialAiScanned.proposed.genres || [])
      : base;
  });

  const [applyState, setApplyState] = useState("idle"); // idle | applying | applied | error
  const [applyError, setApplyError] = useState(null);
  const inFlightRef = useRef(null);

  const handleAiScan = async () => {
    setAiState("loading");
    setAiError(null);
    try {
      const { proposed: claudeProposed } = onClaudeScan
        ? await onClaudeScan(result.filePath)
        : await fetchClaudeForTrack(operationId, result.filePath);
      setAiResult(claudeProposed);
      // Don't auto-check scalar fields after an AI scan — keep the user-opt-in
      // contract. The genre row stays checked because the merged list grew.
      setSelectedGenres((prev) => mergeGenres(prev, claudeProposed.genres || []));
      setAiState("loaded");
    } catch (err) {
      setAiState("error");
      setAiError(err.message);
    }
  };

  const toggleField = (fieldName) => {
    setSelectedFields((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const performApply = () => {
    setApplyState("applying");
    setApplyError(null);

    const fields = {};
    if (selectedFields.artist) fields.artist = displayedProposed.artist;
    if (selectedFields.title) fields.title = displayedProposed.title;
    if (selectedFields.label) fields.label = displayedProposed.label;
    if (selectedFields.year) fields.year = displayedProposed.year;
    if (selectedFields.bpm) fields.bpm = displayedProposed.bpm;
    if (selectedFields.initialKey) fields.initialKey = displayedProposed.initialKey;

    // Write whatever the user has assembled in the genre editor — including
    // the empty list, which clears genres on the track. Gated on the genre
    // checkbox, and skipped if unchanged from the file's current state.
    if (selectedFields.genre) {
      const currentGenresKey = JSON.stringify(
        (result.current.genres || []).map((g) => g.toLowerCase()).sort(),
      );
      const selectedGenresKey = JSON.stringify(
        selectedGenres.map((g) => g.toLowerCase()).sort(),
      );
      if (currentGenresKey !== selectedGenresKey) {
        fields.genre = selectedGenres;
      }
    }

    const promise = (async () => {
      try {
        await applyEnrichment(result.filePath, fields);
        setApplyState("applied");
        onApplied?.(result.filePath);
      } catch (err) {
        setApplyState("error");
        setApplyError(err.message);
        throw err;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  };

  const { current } = result;
  const proposed = displayedProposed;
  const confidence = aiResult ? aiResult.confidence || result.confidence : result.confidence;
  const displayName = inboxPath
    ? result.filePath.replace(inboxPath + "/", "")
    : result.filePath.split("/").pop() || result.filePath;
  const currentGenresKey = JSON.stringify(
    (current.genres || []).map((g) => g.toLowerCase()).sort(),
  );
  const selectedGenresKey = JSON.stringify(
    selectedGenres.map((g) => g.toLowerCase()).sort(),
  );
  const genresChanged = currentGenresKey !== selectedGenresKey;
  // selectedFields.genre is the genre checkbox state, but it only counts as a
  // pending change when the user has actually altered the list. Strip it out
  // of the scalar tally so we don't double-count.
  const pendingFieldCount = Object.entries(selectedFields).filter(
    ([k, v]) => v && k !== "genre",
  ).length;
  const genrePending = !!selectedFields.genre && genresChanged;
  const pendingChangeCount = pendingFieldCount + (genrePending ? 1 : 0);
  const hasSelectedFields = pendingChangeCount > 0;
  const isApplied = applyState === "applied";
  const isApplying = applyState === "applying";

  useImperativeHandle(
    ref,
    () => ({
      // Called by InboxPage's "Continue import" so unapplied selections
      // don't get silently dropped on the floor when the user skips the
      // per-card Apply click.
      async applyIfNeeded() {
        if (inFlightRef.current) return inFlightRef.current;
        if (applyState === "applied") return;
        if (!hasSelectedFields) return;
        await performApply();
      },
    }),
    // performApply closes over selected* state; recreate the handle whenever
    // those change so the parent always invokes the latest version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyState, hasSelectedFields, selectedFields, selectedGenres, displayedProposed],
  );

  // Single unified "Proposed" column: last.fm pills by default, with any
  // AI genres merged in on top after the user clicks the scan button. The
  // merge uses the existing mergeGenres helper so duplicates stay deduped
  // case-insensitively.
  const remoteGenres = aiResult
    ? mergeGenres(proposed.lastgenreGenres || [], aiResult.genres || [])
    : (proposed.lastgenreGenres || []);
  const genreSuggestions =
    remoteGenres.length > 0
      ? [{ source: "remote", label: "Proposed", genres: remoteGenres }]
      : [];

  return (
    <div className="card-brutalist p-6 space-y-4">
      {/* Header: filename + confidence + pending-change status */}
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
          ) : isApplying ? (
            <span className="text-xs font-heading text-foreground/60 flex items-center gap-1">
              <Loader className="w-3 h-3 animate-spin" />
              Applying…
            </span>
          ) : hasSelectedFields ? (
            <span className="text-xs font-heading text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {pendingChangeCount} pending change{pendingChangeCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-xs font-heading text-foreground/40 flex items-center gap-1">
              No changes
            </span>
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
          fieldName="genre"
          selectedFields={selectedFields}
          toggleField={toggleField}
        />
      </div>

      {!isApplied && (
        <div className="flex justify-end">
          {aiState === "loaded" ? (
            <span className="flex items-center gap-1.5 text-xs font-heading text-foreground/60">
              <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              AI scanned
            </span>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleAiScan}
              disabled={aiState === "loading"}
            >
              {aiState === "loading" ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {aiState === "loading" ? "Scanning…" : "AI genre scan"}
            </Button>
          )}
        </div>
      )}

      {aiState === "error" && (
        <div className="flex items-center justify-end gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          AI scan failed: {aiError}
        </div>
      )}

      {applyState === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {applyError}
        </div>
      )}
    </div>
  );
});

export default EnrichmentCard;
