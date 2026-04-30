import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@dj-tools/my-component-library";
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Check,
  Loader,
  AlertCircle,
  X,
  Sparkles,
  Zap,
} from "lucide-react";
import EnrichmentCard from "./EnrichmentCard";
import {
  enrichTracks,
  fetchClaudeForTrackByPath,
} from "../api/enrichment";

const AI_CONCURRENCY = 3;
const SCALAR_FIELDS = ["artist", "title", "label", "year", "bpm", "initialKey"];

function normalize(v) {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim().toLowerCase();
}

function hasNewScalar(current, proposed) {
  if (!proposed) return false;
  return SCALAR_FIELDS.some((f) => {
    const p = normalize(proposed[f]);
    return p !== null && p !== normalize(current[f]);
  });
}

function hasNewGenres(currentGenres, proposedList) {
  if (!proposedList || proposedList.length === 0) return false;
  const cur = new Set((currentGenres || []).map((g) => g.toLowerCase()));
  return proposedList.some((g) => !cur.has(String(g).toLowerCase()));
}

// In eager mode, hide cards where neither last.fm nor Claude propose anything
// new — the user would just hit Skip on every one of them.
function hasAnyProposal(result, ai) {
  const base = result.proposed || {};
  const aiProposed = ai?.proposed || {};
  return (
    hasNewScalar(result.current, base) ||
    hasNewScalar(result.current, aiProposed) ||
    hasNewGenres(result.current.genres, base.lastgenreGenres) ||
    hasNewGenres(result.current.genres, aiProposed.genres)
  );
}

/**
 * Caller-agnostic stepper that runs the inbox-style enrichment review across
 * an arbitrary list of tracks. The caller (e.g. the album page now, a future
 * library-wide scan later) just hands in the file paths and a close handler.
 *
 * Phases:
 *   preflight → lastfm → ai (eager only) → loaded → error
 *
 * In lazy mode (default), the user clicks `AI genre scan` per card.
 * In eager mode, after last.fm finishes the stepper fans out per-track Claude
 * calls with bounded concurrency, then enters the card view with each card
 * pre-marked `AI scanned` via `initialAiScanned`.
 *
 * State for each card lives inside the card itself; non-active cards are
 * hidden via the `hidden` attribute so React preserves their selection state
 * when the user navigates Back/Next without lifting state out of the card.
 *
 * @param {Object} props
 * @param {Array<{path: string}>} props.tracks - Tracks to review
 * @param {boolean} props.isOpen - Whether the stepper is shown
 * @param {Function} props.onClose - Called when the user finishes or dismisses
 */
function BulkGenreMatchStepper({ tracks, isOpen, onClose }) {
  const [phase, setPhase] = useState("preflight"); // preflight | lastfm | ai | loaded | error
  const [loadError, setLoadError] = useState(null);
  const [results, setResults] = useState([]);
  const [errored, setErrored] = useState([]); // paths the backend couldn't enrich
  const [skipped, setSkipped] = useState([]); // eager-mode: paths with no new suggestions
  const [aiResults, setAiResults] = useState({}); // path → { proposed, confidence }
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });
  const [index, setIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const cardRefs = useRef([]);
  const cancelRef = useRef({ cancelled: false });

  // Reset everything whenever the modal opens, so a re-open after close
  // starts at the preflight choice and doesn't carry stale eager-mode AI
  // results from a prior session.
  useEffect(() => {
    if (!isOpen) return;
    setPhase("preflight");
    setLoadError(null);
    setResults([]);
    setErrored([]);
    setSkipped([]);
    setAiResults({});
    setAiProgress({ done: 0, total: 0 });
    setIndex(0);
    cardRefs.current = [];
    cancelRef.current = { cancelled: false };
  }, [isOpen]);

  // Concurrency-limited fan-out. Spawns AI_CONCURRENCY workers that pull the
  // next path off a shared cursor until either the list is exhausted or the
  // cancel ref flips. Each completion bumps progress and stores the result.
  // Returns a local map so the caller can filter results without waiting on
  // React's setAiResults batch to flush.
  const runEagerAi = async (paths) => {
    setAiProgress({ done: 0, total: paths.length });
    const localAi = {};
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (true) {
        if (cancelRef.current.cancelled) return;
        const i = cursor++;
        if (i >= paths.length) return;
        const path = paths[i];
        try {
          const { proposed, confidence } =
            await fetchClaudeForTrackByPath(path);
          if (cancelRef.current.cancelled) return;
          localAi[path] = { proposed, confidence };
          setAiResults((prev) => ({
            ...prev,
            [path]: { proposed, confidence },
          }));
        } catch {
          // Per-track AI failure is non-fatal — card falls back to lazy mode
          // and the user can retry via the in-card AI scan button.
        } finally {
          done += 1;
          setAiProgress({ done, total: paths.length });
        }
      }
    };
    const workers = Array.from({ length: AI_CONCURRENCY }, worker);
    await Promise.all(workers);
    return localAi;
  };

  const beginLoad = async (withEager) => {
    cancelRef.current = { cancelled: false };
    setPhase("lastfm");
    setLoadError(null);
    setResults([]);
    setErrored([]);
    setSkipped([]);
    setAiResults({});
    setAiProgress({ done: 0, total: 0 });
    setIndex(0);
    cardRefs.current = [];

    try {
      const paths = tracks.map((t) => t.path).filter(Boolean);
      if (paths.length === 0) {
        setResults([]);
        setPhase("loaded");
        return;
      }
      const { results: all } = await enrichTracks(paths);
      const ok = [];
      const bad = [];
      for (const r of all) {
        if (r.status === "error") bad.push(r.filePath || "(unknown path)");
        else ok.push(r);
      }
      setErrored(bad);

      if (withEager && ok.length > 0) {
        setPhase("ai");
        const localAi = await runEagerAi(ok.map((r) => r.filePath));
        // Now we know the full picture — drop any track where neither last.fm
        // nor Claude added anything new on top of `current`.
        const kept = [];
        const noNew = [];
        for (const r of ok) {
          if (hasAnyProposal(r, localAi[r.filePath])) kept.push(r);
          else noNew.push(r.filePath);
        }
        setResults(kept);
        setSkipped(noNew);
      } else {
        setResults(ok);
      }
      setPhase("loaded");
    } catch (err) {
      setLoadError(err.message);
      setPhase("error");
    }
  };

  const cancelEagerAi = () => {
    cancelRef.current.cancelled = true;
  };

  const total = results.length;
  const isLast = index === total - 1;
  const atStart = index === 0;

  const goNext = () => {
    if (index < total - 1) setIndex((i) => i + 1);
    else onClose?.();
  };

  const handleApproveNext = async () => {
    const card = cardRefs.current[index];
    if (!card) {
      goNext();
      return;
    }
    setAdvancing(true);
    try {
      await card.applyIfNeeded();
      goNext();
    } catch {
      // Card surfaces its own red error block; keep the user on this card.
    } finally {
      setAdvancing(false);
    }
  };

  const handleSkip = () => {
    if (advancing) return;
    goNext();
  };

  const handleBack = () => {
    if (advancing || atStart) return;
    setIndex((i) => i - 1);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      closeOnBackdropClick={false}
      className="max-h-[90vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border">
        <div>
          <h2 className="font-heading text-foreground text-lg">
            Bulk genre match
          </h2>
          {phase === "loaded" && total > 0 && (
            <p className="text-xs font-mono text-foreground/60 mt-0.5">
              Track {index + 1} of {total}
            </p>
          )}
        </div>
        <Button variant="default" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
          Close
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {phase === "preflight" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-heading text-foreground text-base mb-1">
                Run AI genre scan on all {tracks.length} track
                {tracks.length === 1 ? "" : "s"}?
              </h3>
              <p className="text-xs text-foreground/60">
                Last.fm suggestions always run. AI scan adds Claude's genre
                proposals on top — slower (~30–60s per track) and uses your
                Anthropic API quota, but lets you fly through approvals.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => beginLoad(false)}
              >
                <SkipForward className="w-4 h-4" />
                Skip AI (lazy)
              </Button>
              <Button
                variant="default"
                size="md"
                onClick={() => beginLoad(true)}
              >
                <Zap className="w-4 h-4" />
                Run AI on all
              </Button>
            </div>
          </div>
        )}

        {phase === "lastfm" && (
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <Loader className="w-4 h-4 animate-spin" />
            Fetching last.fm suggestions for {tracks.length} track
            {tracks.length === 1 ? "" : "s"}…
          </div>
        )}

        {phase === "ai" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <Sparkles className="w-4 h-4" />
              AI scanning {aiProgress.done} / {aiProgress.total}…
            </div>
            <div className="h-1.5 w-full bg-background-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-main transition-[width] duration-300"
                style={{
                  width: `${aiProgress.total ? (aiProgress.done / aiProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <div>
              <Button variant="default" size="sm" onClick={cancelEagerAi}>
                <X className="w-3 h-3" />
                Cancel AI scan
              </Button>
              <p className="text-xs text-foreground/50 mt-2">
                Tracks scanned so far will keep their AI proposals. The rest
                fall back to lazy — you can scan them per-card later.
              </p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {loadError || "Failed to load enrichments"}
          </div>
        )}

        {phase === "loaded" && errored.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 border-2 border-amber-500/40 bg-amber-500/5 rounded-base p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-heading mb-1">
                Skipped {errored.length} track{errored.length === 1 ? "" : "s"}
                {" "}the backend couldn't read:
              </div>
              <ul className="font-mono space-y-0.5">
                {errored.map((p) => (
                  <li key={p} className="truncate">{p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {phase === "loaded" && skipped.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-foreground/70 border-2 border-border bg-background-secondary/50 rounded-base p-3">
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
            <div>
              <div className="font-heading mb-1">
                Skipped {skipped.length} track{skipped.length === 1 ? "" : "s"}
                {" "}with no new suggestions:
              </div>
              <ul className="font-mono space-y-0.5">
                {skipped.map((p) => (
                  <li key={p} className="truncate">{p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {phase === "loaded" &&
          total === 0 &&
          errored.length === 0 &&
          skipped.length === 0 && (
            <div className="text-sm text-foreground/60">
              No tracks to review.
            </div>
          )}

        {phase === "loaded" && total === 0 && skipped.length > 0 && (
          <div className="text-sm text-foreground/60">
            All tracks already have everything last.fm and Claude could
            propose. Nothing to review.
          </div>
        )}

        {phase === "loaded" && total > 0 && (
          <div>
            {results.map((r, i) => (
              <div key={r.filePath} hidden={i !== index}>
                <EnrichmentCard
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  result={r}
                  onClaudeScan={fetchClaudeForTrackByPath}
                  initialAiScanned={aiResults[r.filePath] || undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {phase === "loaded" && total > 0 && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t-2 border-border">
          <Button
            variant="secondary"
            size="md"
            onClick={handleBack}
            disabled={atStart || advancing}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="md"
              onClick={handleSkip}
              disabled={advancing}
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleApproveNext}
              disabled={advancing}
            >
              {advancing ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : isLast ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {isLast ? "Approve & finish" : "Approve & next"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default BulkGenreMatchStepper;
