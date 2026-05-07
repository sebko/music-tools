import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@dj-tools/my-component-library";
import {
  AlertCircle,
  Check,
  Loader,
  SkipForward,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  applyEnrichment,
  enrichTracks,
  fetchClaudeForTrackByPath,
} from "../api/enrichment";

const CONCURRENCY = 3;

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

function genresEqual(a = [], b = []) {
  const ka = [...a].map((g) => g.toLowerCase()).sort();
  const kb = [...b].map((g) => g.toLowerCase()).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  return true;
}

function basename(p) {
  return p?.split("/").pop() || p;
}

// Concurrency-limited fan-out. Spawns N workers that pull off a shared
// cursor. Each completion bumps the progress callback. The cancel ref lets
// the caller abort between work items.
async function runWorkers(items, handler, { concurrency, cancelRef, onProgress }) {
  let cursor = 0;
  let done = 0;
  const total = items.length;
  const worker = async () => {
    while (true) {
      if (cancelRef.current.cancelled) return;
      const i = cursor++;
      if (i >= total) return;
      try {
        await handler(items[i], i);
      } finally {
        done += 1;
        onProgress?.(done, total);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/**
 * Auto-mode bulk genre application.
 *
 * Phases: preflight → lastfm → claude (if AI) → preview → applying → done.
 *
 * The preview phase is a hard gate — auto-mode writes are destructive (they
 * modify files on disk), so the user always sees a "will apply N, skip M"
 * summary before any write happens. Auto-mode only writes the genre tag —
 * scalar suggestions (artist/title/year/bpm/key) still require interactive
 * review.
 *
 * @param {Object} props
 * @param {Array<{path: string}>} props.tracks - Tracks to process
 * @param {boolean} props.isOpen - Whether the modal is shown
 * @param {Function} props.onClose - Called when the user finishes or dismisses
 */
function AutoGenreMatchRunner({ tracks, isOpen, onClose }) {
  const [phase, setPhase] = useState("preflight");
  // preflight | lastfm | claude | preview | applying | done | error
  const [error, setError] = useState(null);

  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });

  // Preview decisions (computed before applying).
  const [plan, setPlan] = useState({ toApply: [], skipped: [] });

  // Apply phase progress + outcomes.
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [appliedCount, setAppliedCount] = useState(0);
  const [failures, setFailures] = useState([]);

  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    if (!isOpen) return;
    setPhase("preflight");
    setError(null);
    setAiProgress({ done: 0, total: 0 });
    setPlan({ toApply: [], skipped: [] });
    setApplyProgress({ done: 0, total: 0 });
    setAppliedCount(0);
    setFailures([]);
    cancelRef.current = { cancelled: false };
  }, [isOpen]);

  const buildPlan = (enrichmentMap, aiMap) => {
    const toApply = [];
    const skipped = [];
    for (const t of tracks) {
      const r = enrichmentMap[t.path];
      if (!r) {
        skipped.push({ path: t.path, reason: "Failed to load" });
        continue;
      }
      const current = r.current.genres || [];
      const lastfm = r.proposed.lastgenreGenres || [];
      const claude = aiMap[t.path]?.proposed?.genres || [];
      const merged = mergeGenres(mergeGenres(current, lastfm), claude);
      if (genresEqual(merged, current)) {
        skipped.push({ path: t.path, reason: "No new proposals" });
      } else {
        toApply.push({ path: t.path, genres: merged });
      }
    }
    return { toApply, skipped };
  };

  const begin = async (aiEnabled) => {
    cancelRef.current = { cancelled: false };
    setError(null);

    setPhase("lastfm");
    let enrichmentMap;
    try {
      const paths = tracks.map((t) => t.path).filter(Boolean);
      const { results } = await enrichTracks(paths);
      enrichmentMap = {};
      for (const r of results) {
        if (r.status === "success") enrichmentMap[r.filePath] = r;
      }
    } catch (err) {
      setError(err.message);
      setPhase("error");
      return;
    }

    const aiMap = {};
    if (aiEnabled) {
      setPhase("claude");
      const successPaths = Object.keys(enrichmentMap);
      setAiProgress({ done: 0, total: successPaths.length });
      await runWorkers(
        successPaths,
        async (path) => {
          if (cancelRef.current.cancelled) return;
          try {
            aiMap[path] = await fetchClaudeForTrackByPath(path);
          } catch {
            // Per-track AI failure is non-fatal — we just won't have Claude
            // genres for that track. Last.fm + current still feed the merge.
          }
        },
        {
          concurrency: CONCURRENCY,
          cancelRef,
          onProgress: (done, total) => setAiProgress({ done, total }),
        },
      );
    }

    const computed = buildPlan(enrichmentMap, aiMap);
    setPlan(computed);
    setPhase("preview");
  };

  const cancelClaude = () => {
    cancelRef.current.cancelled = true;
  };

  const startApply = async () => {
    cancelRef.current = { cancelled: false };
    setPhase("applying");
    setApplyProgress({ done: 0, total: plan.toApply.length });
    setAppliedCount(0);
    setFailures([]);
    let applied = 0;
    const fails = [];

    await runWorkers(
      plan.toApply,
      async (item) => {
        if (cancelRef.current.cancelled) return;
        try {
          await applyEnrichment(item.path, { genre: item.genres });
          applied += 1;
          setAppliedCount(applied);
        } catch (err) {
          fails.push({ path: item.path, error: err.message });
          setFailures([...fails]);
        }
      },
      {
        concurrency: CONCURRENCY,
        cancelRef,
        onProgress: (done, total) => setApplyProgress({ done, total }),
      },
    );

    setPhase("done");
  };

  const cancelApplying = () => {
    cancelRef.current.cancelled = true;
  };

  const showProgressBar = (done, total) => (
    <div className="h-1.5 w-full bg-background-secondary rounded-full overflow-hidden">
      <div
        className="h-full bg-main transition-[width] duration-300"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      closeOnBackdropClick={false}
      className="max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border">
        <h2 className="font-heading text-foreground text-lg">
          Match genres (auto)
        </h2>
        <Button variant="default" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
          Close
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {phase === "preflight" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-heading text-foreground text-base mb-1">
                Run AI scanner across all {tracks.length} track
                {tracks.length === 1 ? "" : "s"}?
              </h3>
              <p className="text-xs text-foreground/60">
                Auto mode fetches last.fm genres for every track and writes
                them straight to disk after a preview. Adding the AI scan
                also queries Claude for extra genres — slower (~30–60s per
                track) and uses your Anthropic quota. Auto mode only writes
                the genre tag; scalar fields stay unchanged.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="md" onClick={() => begin(false)}>
                <SkipForward className="w-4 h-4" />
                Skip AI
              </Button>
              <Button variant="default" size="md" onClick={() => begin(true)}>
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

        {phase === "claude" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <Sparkles className="w-4 h-4" />
              AI scanning {aiProgress.done} / {aiProgress.total}…
            </div>
            {showProgressBar(aiProgress.done, aiProgress.total)}
            <div>
              <Button variant="default" size="sm" onClick={cancelClaude}>
                <X className="w-3 h-3" />
                Skip remaining AI scans
              </Button>
              <p className="text-xs text-foreground/50 mt-2">
                Tracks scanned so far keep their AI proposals. The rest
                fall back to last.fm + current.
              </p>
            </div>
          </div>
        )}

        {phase === "preview" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-heading text-foreground text-base mb-1">
                Ready to apply
              </h3>
              <p className="text-xs text-foreground/60">
                Genres only — scalar fields are never written by auto mode.
                Cancel here writes nothing.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border-2 border-main bg-main/5 rounded-base p-3">
                <div className="font-heading text-sm">Will apply</div>
                <div className="font-mono text-2xl">{plan.toApply.length}</div>
                <div className="text-xs text-foreground/60">tracks</div>
              </div>
              <div className="border-2 border-border bg-background-secondary/50 rounded-base p-3">
                <div className="font-heading text-sm">Skipped</div>
                <div className="font-mono text-2xl">{plan.skipped.length}</div>
                <div className="text-xs text-foreground/60">no new genres</div>
              </div>
            </div>

            {plan.toApply.length > 0 && (
              <details className="border-2 border-border rounded-base">
                <summary className="cursor-pointer px-3 py-2 font-heading text-sm">
                  Preview ({plan.toApply.length})
                </summary>
                <ul className="font-mono text-xs px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                  {plan.toApply.map((item) => (
                    <li key={item.path} className="border-b border-border/40 pb-1">
                      <div className="truncate" title={item.path}>
                        {basename(item.path)}
                      </div>
                      <div className="text-foreground/60">
                        → {item.genres.join(", ")}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {plan.skipped.length > 0 && (
              <details className="border-2 border-border rounded-base">
                <summary className="cursor-pointer px-3 py-2 font-heading text-sm">
                  Skipped ({plan.skipped.length})
                </summary>
                <ul className="font-mono text-xs px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                  {plan.skipped.map((item) => (
                    <li key={item.path} className="truncate" title={item.path}>
                      {basename(item.path)} — {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {phase === "applying" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <Loader className="w-4 h-4 animate-spin" />
              Applying {applyProgress.done} / {applyProgress.total}…
            </div>
            {showProgressBar(applyProgress.done, applyProgress.total)}
            <Button variant="default" size="sm" onClick={cancelApplying}>
              <X className="w-3 h-3" />
              Stop
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="border-2 border-green-500/40 bg-green-500/5 rounded-base p-3">
                <div className="font-heading text-sm">Applied</div>
                <div className="font-mono text-2xl">{appliedCount}</div>
              </div>
              <div className="border-2 border-border bg-background-secondary/50 rounded-base p-3">
                <div className="font-heading text-sm">Skipped</div>
                <div className="font-mono text-2xl">{plan.skipped.length}</div>
              </div>
              <div className="border-2 border-red-500/40 bg-red-500/5 rounded-base p-3">
                <div className="font-heading text-sm">Failed</div>
                <div className="font-mono text-2xl">{failures.length}</div>
              </div>
            </div>

            {failures.length > 0 && (
              <details className="border-2 border-red-500/40 rounded-base">
                <summary className="cursor-pointer px-3 py-2 font-heading text-sm text-red-600 dark:text-red-400">
                  Failures ({failures.length})
                </summary>
                <ul className="font-mono text-xs px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                  {failures.map((f) => (
                    <li key={f.path}>
                      <div className="truncate" title={f.path}>{basename(f.path)}</div>
                      <div className="text-red-600 dark:text-red-400">{f.error}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error || "Something went wrong"}
          </div>
        )}
      </div>

      {phase === "preview" && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t-2 border-border">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={startApply}
            disabled={plan.toApply.length === 0}
          >
            <Check className="w-4 h-4" />
            {plan.toApply.length === 0
              ? "Nothing to apply"
              : `Apply ${plan.toApply.length} track${plan.toApply.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t-2 border-border">
          <Button variant="primary" size="md" onClick={onClose}>
            <Check className="w-4 h-4" />
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default AutoGenreMatchRunner;
