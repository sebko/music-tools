import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  MetadataRow,
  EditableGenresRow,
  Button,
} from "@music-tools/my-component-library";
import { Check, AlertCircle, Loader, Sparkles } from "lucide-react";
import {
  applyEnrichment,
  enrichTracks,
  fetchClaudeForTrack,
  fetchClaudeForTrackByPath,
} from "../api/enrichment";

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

function defaultSelection() {
  return { genre: true };
}

function basename(filePath) {
  if (!filePath) return "";
  return filePath.split("/").pop() || filePath;
}

/**
 * Outer card wrapper. Two modes:
 *
 *   1. **Eager** — caller passes a fully-populated `result` (existing inbox
 *      flow). Renders the body immediately.
 *   2. **Lazy** — caller passes `lazyFilePath` + `isActive` (+ optional
 *      `runAiOnLoad`). The card stays as a skeleton until `isActive`
 *      flips true, at which point it fetches its own enrichment via
 *      `enrichTracks([path])` and, if `runAiOnLoad`, also fires Claude.
 *
 * `applyIfNeeded` is forwarded through to the inner body so the parent
 * stepper's "Approve & next" still works the same way.
 */
const EnrichmentCard = forwardRef(function EnrichmentCard(
  {
    result: propResult,
    lazyFilePath,
    isActive,
    runAiOnLoad,
    operationId,
    inboxPath,
    onClaudeScan,
    onApplied,
    initialAiScanned,
  },
  ref,
) {
  const [resolvedResult, setResolvedResult] = useState(propResult || null);
  const [resolvedAi, setResolvedAi] = useState(initialAiScanned || null);
  const [loadState, setLoadState] = useState(propResult ? "loaded" : "idle");
  const [loadError, setLoadError] = useState(null);
  const fetchedRef = useRef(!!propResult);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (propResult) return;
    if (!lazyFilePath) return;
    if (!isActive) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        const { results } = await enrichTracks([lazyFilePath]);
        if (cancelled) return;
        const r = results?.[0];
        if (!r || r.status === "error") {
          setLoadState("error");
          setLoadError(r?.error || "Failed to load track");
          return;
        }
        setResolvedResult(r);
        setLoadState("loaded");
        if (runAiOnLoad) {
          try {
            const ai = await fetchClaudeForTrackByPath(lazyFilePath);
            if (!cancelled) setResolvedAi(ai);
          } catch {
            // Best-effort — user can still trigger AI scan from the card.
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState("error");
          setLoadError(err.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propResult, lazyFilePath, isActive, runAiOnLoad]);

  useImperativeHandle(
    ref,
    () => ({
      async applyIfNeeded() {
        if (!bodyRef.current) return;
        await bodyRef.current.applyIfNeeded();
      },
    }),
    [],
  );

  if (loadState === "idle" || loadState === "loading") {
    return (
      <div className="card-brutalist p-6 space-y-4">
        <div className="font-mono text-sm text-foreground truncate" title={lazyFilePath}>
          {basename(lazyFilePath)}
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground/60">
          <Loader className="w-4 h-4 animate-spin" />
          {loadState === "loading"
            ? "Loading metadata + last.fm…"
            : "Waiting…"}
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="card-brutalist p-6 space-y-3 border-red-500/40">
        <div className="font-mono text-sm text-foreground truncate" title={lazyFilePath}>
          {basename(lazyFilePath)}
        </div>
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError || "Failed to load"}
        </div>
      </div>
    );
  }

  return (
    <EnrichmentCardBody
      ref={bodyRef}
      result={resolvedResult}
      operationId={operationId}
      inboxPath={inboxPath}
      onClaudeScan={onClaudeScan}
      onApplied={onApplied}
      initialAiScanned={resolvedAi || undefined}
    />
  );
});

/**
 * Inner card body. Renders only once a fully-populated `result` is in hand,
 * so the genre/scalar useState initializers can read `result.current` /
 * `result.proposed` directly without null-guards.
 */
const EnrichmentCardBody = forwardRef(function EnrichmentCardBody(
  { result, operationId, inboxPath, onClaudeScan, onApplied, initialAiScanned },
  ref,
) {
  const [aiState, setAiState] = useState(() =>
    initialAiScanned ? "loaded" : "idle",
  );
  const [aiResult, setAiResult] = useState(() =>
    initialAiScanned ? initialAiScanned.proposed : null,
  );
  const [aiError, setAiError] = useState(null);

  const displayedProposed = aiResult ?? result.proposed;

  const [selectedFields, setSelectedFields] = useState(() => defaultSelection());

  const [selectedGenres, setSelectedGenres] = useState(() => {
    const base = mergeGenres(
      result.current.genres || [],
      result.proposed.lastgenreGenres || [],
    );
    return initialAiScanned
      ? mergeGenres(base, initialAiScanned.proposed.genres || [])
      : base;
  });

  const [applyState, setApplyState] = useState("idle");
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
      async applyIfNeeded() {
        if (inFlightRef.current) return inFlightRef.current;
        if (applyState === "applied") return;
        if (!hasSelectedFields) return;
        await performApply();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyState, hasSelectedFields, selectedFields, selectedGenres, displayedProposed],
  );

  const remoteGenres = aiResult
    ? mergeGenres(proposed.lastgenreGenres || [], aiResult.genres || [])
    : (proposed.lastgenreGenres || []);
  const genreSuggestions =
    remoteGenres.length > 0
      ? [{ source: "remote", label: "Proposed", genres: remoteGenres }]
      : [];

  return (
    <div className="card-brutalist p-6 space-y-4">
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

      <div className="grid grid-cols-[auto_auto_1fr_1fr] gap-x-4">
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
