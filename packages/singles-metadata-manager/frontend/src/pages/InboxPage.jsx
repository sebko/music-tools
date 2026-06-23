import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  PageLoader,
  Button,
  EmptyState,
} from "@music-tools/my-component-library";
import {
  Inbox,
  RefreshCw,
  Play,
  Check,
  AlertCircle,
  Loader,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import {
  fetchInboxStatus,
  runInboxImport,
  resumeInboxImport,
  resumeInboxImportAfterDuplicateReview,
  resumeInboxImportAfterIntraBatchReview,
} from "../api/inbox";
import { useOperationPolling } from "../hooks/useOperationPolling";
import EnrichmentCard from "../components/EnrichmentCard";
import DuplicateReviewCard from "../components/DuplicateReviewCard";
import IntraBatchReviewCard from "../components/IntraBatchReviewCard";

const PHASE_LABELS = {
  validating: "Validating inbox tags",
  "checking-intra-batch": "Checking for duplicates in this import",
  "awaiting-intra-batch-review": "Resolve duplicates in this import",
  "checking-duplicates": "Checking for duplicates in library",
  "awaiting-duplicate-review": "Review duplicates",
  "removing-duplicates": "Removing replaced library tracks",
  converting: "Converting audio formats",
  importing: "Importing files with beets",
  checking: "Checking file integrity",
  tagging: "Normalizing tags",
  scrubbing: "Scrubbing legacy tag frames",
  enriching: "Fetching last.fm genre suggestions",
  "awaiting-enrichment-review": "Review metadata suggestions",
  artwork: "Embedding artwork",
  ftintitle: "Cleaning featured artists",
  replaygain: "Computing loudness (ReplayGain)",
  updating: "Syncing beets database",
  done: "Complete",
};

function defaultDecisions(duplicateMatches) {
  const out = {};
  for (const dup of duplicateMatches || []) {
    const bestLib = Math.max(...dup.matches.map((m) => m.bitrate || 0));
    const action = (dup.bitrate || 0) > bestLib ? "replace" : "skip_delete";
    out[dup.file] = {
      action,
      replaceIds: action === "replace" ? dup.matches.map((m) => m.id) : undefined,
    };
  }
  return out;
}

// Default: keep the recommended best copy in each group, delete the rest.
function defaultIntraBatchDecisions(groups) {
  const out = {};
  for (const group of groups || []) {
    for (const f of group.files) {
      out[f.file] = { action: f.isKeeper ? "keep" : "delete" };
    }
  }
  return out;
}

function InboxPage() {
  const queryClient = useQueryClient();
  const [operationId, setOperationId] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [duplicateDecisions, setDuplicateDecisions] = useState({});
  const [intraBatchDecisions, setIntraBatchDecisions] = useState({});

  const { data: inbox, isLoading } = useQuery({
    queryKey: ["inbox-status"],
    queryFn: fetchInboxStatus,
    refetchOnWindowFocus: false,
  });

  const startMutation = useMutation({
    mutationFn: runInboxImport,
    onSuccess: (data) => setOperationId(data.operationId),
  });

  const { data: operation } = useOperationPolling(operationId);

  const status = operation?.status;
  const hasStarted = !!operationId || startMutation.isPending;
  const isAwaitingReview = status === "awaiting_review";
  const isAwaitingDuplicateReview = status === "awaiting_duplicate_review";
  const isAwaitingIntraBatchReview = status === "awaiting_intra_batch_review";
  const isRunning = status === "running" || (hasStarted && !operation);
  const isComplete = status === "completed";
  const isFailed = status === "failed" || startMutation.isError;
  const isPaused =
    isAwaitingReview || isAwaitingDuplicateReview || isAwaitingIntraBatchReview;

  // Initialise per-file decisions when the operation enters duplicate-review.
  // Re-init only when the underlying duplicate set changes — re-renders
  // mid-review must not blow away in-progress user choices.
  useEffect(() => {
    if (isAwaitingDuplicateReview && operation?.duplicateMatches) {
      setDuplicateDecisions((prev) =>
        Object.keys(prev).length === 0
          ? defaultDecisions(operation.duplicateMatches)
          : prev,
      );
    }
    if (!isAwaitingDuplicateReview && Object.keys(duplicateDecisions).length > 0) {
      setDuplicateDecisions({});
    }
  }, [isAwaitingDuplicateReview, operation?.duplicateMatches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same lifecycle for the intra-batch (first) duplicate screen.
  useEffect(() => {
    if (isAwaitingIntraBatchReview && operation?.intraBatchGroups) {
      setIntraBatchDecisions((prev) =>
        Object.keys(prev).length === 0
          ? defaultIntraBatchDecisions(operation.intraBatchGroups)
          : prev,
      );
    }
    if (!isAwaitingIntraBatchReview && Object.keys(intraBatchDecisions).length > 0) {
      setIntraBatchDecisions({});
    }
  }, [isAwaitingIntraBatchReview, operation?.intraBatchGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Holds an imperative handle for each EnrichmentCard rendered below, so
  // "Continue import" can apply any unsaved selections before resuming the
  // post-enrichment phases. Indexed by reviewableResults order.
  const cardRefs = useRef([]);

  // "Run AI scan on all" runs Claude over every reviewable card sequentially
  // (gentler on the API than firing all at once). Each card renders its own
  // scanning/scanned/error state, so a single failure never aborts the batch.
  const [bulkScan, setBulkScan] = useState({ running: false, done: 0, total: 0 });

  const handleScanAll = async () => {
    const cards = cardRefs.current.filter(Boolean);
    setBulkScan({ running: true, done: 0, total: cards.length });
    for (let i = 0; i < cards.length; i++) {
      try {
        await cards[i].runAiScanIfNeeded?.();
      } catch {
        // Card surfaces its own error; keep going through the batch.
      }
      setBulkScan((s) => ({ ...s, done: i + 1 }));
    }
    setBulkScan((s) => ({ ...s, running: false }));
  };

  const resumeMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        cardRefs.current
          .filter(Boolean)
          .map((card) => card.applyIfNeeded()),
      );
      return resumeInboxImport(operationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation", operationId] });
    },
  });

  const resumeDupMutation = useMutation({
    mutationFn: () =>
      resumeInboxImportAfterDuplicateReview(operationId, duplicateDecisions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation", operationId] });
    },
  });

  const resumeIntraBatchMutation = useMutation({
    mutationFn: () =>
      resumeInboxImportAfterIntraBatchReview(operationId, intraBatchDecisions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation", operationId] });
    },
  });

  const handleDecisionChange = (filePath, decision) => {
    setDuplicateDecisions((prev) => ({ ...prev, [filePath]: decision }));
  };

  const handleIntraBatchChange = (filePath, decision) => {
    setIntraBatchDecisions((prev) => ({ ...prev, [filePath]: decision }));
  };

  const allReplaceDecisionsValid = Object.values(duplicateDecisions).every((d) =>
    d.action === "replace" ? Array.isArray(d.replaceIds) && d.replaceIds.length > 0 : true,
  );

  // Every intra-batch group must keep at least one copy.
  const allIntraBatchGroupsValid = (operation?.intraBatchGroups || []).every(
    (group) =>
      group.files.some(
        (f) => (intraBatchDecisions[f.file]?.action || "keep") !== "delete",
      ),
  );

  if (isComplete && operationId) {
    // One-shot refresh when the pipeline finishes so the UI reflects the new
    // DB state. Guarded by `operationId` so we only invalidate once per run.
    queryClient.invalidateQueries({ queryKey: ["inbox-status"] });
    queryClient.invalidateQueries({ queryKey: ["albums"] });
  }

  const handleRescan = () => {
    queryClient.invalidateQueries({ queryKey: ["inbox-status"] });
  };

  const handleImport = () => {
    setOperationId(null);
    startMutation.reset();
    startMutation.mutate();
  };

  const handleReset = () => {
    setOperationId(null);
    setDuplicateDecisions({});
    setIntraBatchDecisions({});
    startMutation.reset();
    resumeMutation.reset();
    resumeDupMutation.reset();
    resumeIntraBatchMutation.reset();
  };

  if (isLoading) {
    return <PageLoader message="Loading inbox..." />;
  }

  const inboxPath = inbox?.inboxPath;
  const files = inbox?.files || [];
  const count = inbox?.count || 0;

  const total = operation?.total ?? 0;
  const processed = isComplete && total
    ? total
    : Math.min(operation?.processed ?? 0, total || Infinity);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const phase = operation?.phase || "importing";
  const phaseLabel = PHASE_LABELS[phase] || phase;

  let content;

  if (!inboxPath) {
    content = (
      <EmptyState
        icon={<Inbox className="w-16 h-16" />}
        heading="No inbox configured"
        description="Set an inbox folder in Settings to start importing new music."
        action={
          <Link to="/settings">
            <Button variant="primary" size="md">
              <FolderOpen className="w-4 h-4" />
              Open Settings
            </Button>
          </Link>
        }
      />
    );
  } else if (hasStarted) {
    const reviewableResults = (operation?.enrichmentResults || []).filter(
      (r) => r.status !== "error",
    );

    content = (
      <div className="card-brutalist p-6 space-y-4">
        <div className="flex items-center gap-3">
          {isComplete ? (
            <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
          ) : isFailed ? (
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          ) : isPaused ? (
            <Check className="w-6 h-6 text-amber-500" />
          ) : (
            <Loader className="w-6 h-6 animate-spin text-main" />
          )}
          <h2 className="text-xl font-heading text-foreground">
            {isComplete
              ? "Import complete"
              : isFailed
                ? "Import failed"
                : phaseLabel}
          </h2>
        </div>

        {isAwaitingIntraBatchReview && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/70">
              {(operation?.intraBatchGroups?.length || 0)} set
              {(operation?.intraBatchGroups?.length || 0) === 1 ? "" : "s"} of
              duplicate files arrived together in this import. The best copy
              (★) is kept by default and the rest are deleted from the inbox —
              adjust any file before continuing.
            </p>
            <div className="space-y-4">
              {(operation?.intraBatchGroups || []).map((group) => (
                <IntraBatchReviewCard
                  key={group.key}
                  group={group}
                  decisions={intraBatchDecisions}
                  onChange={handleIntraBatchChange}
                  inboxPath={operation?.inboxPath || inboxPath || ""}
                />
              ))}
            </div>
            {resumeIntraBatchMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {resumeIntraBatchMutation.error?.message}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => resumeIntraBatchMutation.mutate()}
                disabled={resumeIntraBatchMutation.isPending || !allIntraBatchGroupsValid}
              >
                {resumeIntraBatchMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Continue import
              </Button>
            </div>
          </div>
        )}

        {isAwaitingDuplicateReview && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/70">
              {(operation?.duplicateMatches?.length || 0)} inbox file
              {(operation?.duplicateMatches?.length || 0) === 1 ? "" : "s"} already
              appear in the library. Pick an action for each. The recommended
              action (★) is based on bitrate.
            </p>
            <div className="space-y-4">
              {(operation?.duplicateMatches || []).map((dup) => (
                <DuplicateReviewCard
                  key={dup.file}
                  duplicate={dup}
                  decision={duplicateDecisions[dup.file]}
                  onChange={handleDecisionChange}
                  inboxPath={operation?.inboxPath || inboxPath || ""}
                />
              ))}
            </div>
            {resumeDupMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {resumeDupMutation.error?.message}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => resumeDupMutation.mutate()}
                disabled={resumeDupMutation.isPending || !allReplaceDecisionsValid}
              >
                {resumeDupMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Continue import
              </Button>
            </div>
          </div>
        )}

        {isAwaitingReview && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/70">
              Review metadata for {reviewableResults.length} track
              {reviewableResults.length === 1 ? "" : "s"}. Last.fm genre
              suggestions are shown by default. Click <strong>Run AI scan on all</strong>
              {" "}to pull richer suggestions from Claude for every track at once,
              or scan individual cards. Edit fields and genres as needed — your
              selections will be written automatically when you click{" "}
              <strong>Apply &amp; continue import</strong>.
            </p>
            <div className="flex justify-end">
              <Button
                variant="default"
                size="md"
                onClick={handleScanAll}
                disabled={bulkScan.running || resumeMutation.isPending}
              >
                {bulkScan.running ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {bulkScan.running
                  ? `Scanning ${bulkScan.done}/${bulkScan.total}…`
                  : `Run AI scan on all ${reviewableResults.length} track${reviewableResults.length === 1 ? "" : "s"}`}
              </Button>
            </div>
            <div className="space-y-4">
              {reviewableResults.map((r, i) => (
                <EnrichmentCard
                  key={r.filePath}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  result={r}
                  operationId={operationId}
                  inboxPath={operation?.inboxPath || inboxPath || ""}
                />
              ))}
            </div>
            {resumeMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {resumeMutation.error?.message}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending || bulkScan.running}
              >
                {resumeMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Apply &amp; continue import
              </Button>
            </div>
          </div>
        )}

        {isRunning && total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-mono text-foreground/80">
              <span>
                {processed.toLocaleString()} / {total.toLocaleString()}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="card-brutalist h-3 p-0 overflow-hidden">
              <div
                className="h-full bg-main transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            {operation?.currentFile && (
              <div className="text-xs font-mono text-foreground/60 truncate">
                {operation.currentFile}
              </div>
            )}
          </div>
        )}

        {isRunning && total === 0 && (
          <div className="flex items-center gap-3 text-foreground/80">
            <Loader className="w-5 h-5 animate-spin text-main" />
            {phaseLabel}...
          </div>
        )}

        {isFailed && (
          <div className="text-sm font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {operation?.error || startMutation.error?.message}
          </div>
        )}

        {operation?.output && (
          <div>
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="text-xs font-mono text-foreground/60 hover:text-foreground underline"
            >
              {showLog ? "Hide" : "Show"} details
            </button>
            {showLog && (
              <pre className="card-brutalist p-4 mt-2 text-xs font-mono text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto">
                {operation.output}
              </pre>
            )}
          </div>
        )}

        {(isComplete || isFailed) && (
          <div className="flex justify-end pt-2">
            <Button variant="primary" size="md" onClick={handleReset}>
              Done
            </Button>
          </div>
        )}
      </div>
    );
  } else if (count === 0) {
    content = (
      <EmptyState
        icon={<Inbox className="w-16 h-16" />}
        heading="Nothing to import"
        description={`No new audio files in ${inboxPath}. Drop files into the folder and click Rescan.`}
        action={
          <Button variant="default" size="md" onClick={handleRescan}>
            <RefreshCw className="w-4 h-4" />
            Rescan
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="card-brutalist p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-heading text-foreground">
              {count} file{count === 1 ? "" : "s"} pending
            </div>
            <div className="flex items-center gap-3">
              <Button variant="default" size="md" onClick={handleRescan}>
                <RefreshCw className="w-4 h-4" />
                Rescan
              </Button>
              <Button variant="primary" size="md" onClick={handleImport}>
                <Play className="w-4 h-4" />
                Import {count}
              </Button>
            </div>
          </div>
          <ul className="text-xs font-mono text-foreground/70 max-h-96 overflow-y-auto space-y-1">
            {files.map((f) => (
              <li key={f} className="truncate">
                {f.replace(inboxPath + "/", "")}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle={inboxPath || "No inbox folder set"}
      />
      <div className="mt-6">{content}</div>
    </div>
  );
}

export default InboxPage;
