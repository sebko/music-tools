import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  Button,
  EmptyState,
} from "@dj-tools/my-component-library";
import {
  FolderOpen,
  Download,
  Trash2,
  Search,
  Copy,
  Sparkles,
  Check,
  PartyPopper,
  Loader,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import {
  updateBeetsLibraryDirectory,
  startBeetsImport,
  startBeetsIdentify,
  fetchUnprocessedFiles,
  deleteUnprocessedFiles,
  fetchDuplicateGroups,
  deleteDuplicateTracks,
  runBeetsPlugin,
  markSetupComplete,
} from "../api/setup";
import { useOperationPolling } from "../hooks/useOperationPolling";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "library", label: "Library" },
  { id: "import", label: "Import" },
  { id: "cleanup", label: "Cleanup" },
  { id: "identify", label: "Identify" },
  { id: "duplicates", label: "Duplicates" },
  { id: "scrub", label: "Scrub" },
  { id: "complete", label: "Done" },
];

function SetupWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [libraryPath, setLibraryPath] = useState("");

  const currentStep = STEPS[stepIndex];
  const goNext = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const finish = async () => {
    await markSetupComplete();
    queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
    queryClient.invalidateQueries({ queryKey: ["albums"] });
    navigate("/");
  };

  return (
    <div>
      <PageHeader
        title="Setup Wizard"
        subtitle="Get your singles library ready with beets"
      />

      <WizardProgress stepIndex={stepIndex} />

      <div className="mt-6 max-w-3xl">
        {currentStep.id === "welcome" && (
          <StepWelcome onNext={goNext} />
        )}
        {currentStep.id === "library" && (
          <StepLibraryPath
            libraryPath={libraryPath}
            setLibraryPath={setLibraryPath}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep.id === "import" && (
          <StepImport
            libraryPath={libraryPath}
            onNext={goNext}
          />
        )}
        {currentStep.id === "cleanup" && (
          <StepCleanup
            libraryPath={libraryPath}
            onNext={goNext}
            onSkip={goNext}
          />
        )}
        {currentStep.id === "identify" && (
          <StepIdentify onNext={goNext} onBack={goBack} />
        )}
        {currentStep.id === "duplicates" && (
          <StepDuplicates onNext={goNext} onBack={goBack} />
        )}
        {currentStep.id === "scrub" && (
          <StepScrub onNext={goNext} />
        )}
        {currentStep.id === "complete" && (
          <StepComplete onFinish={finish} />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Progress header
// --------------------------------------------------------------------------

function WizardProgress({ stepIndex }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STEPS.map((step, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-base border-2 border-border font-heading text-xs ${
                isActive
                  ? "bg-main text-main-foreground"
                  : isDone
                  ? "bg-background text-foreground"
                  : "bg-background text-foreground/40"
              }`}
            >
              {i + 1}. {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-foreground/30" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Welcome
// --------------------------------------------------------------------------

function StepWelcome({ onNext }) {
  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <PartyPopper className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Let&apos;s set up your library
        </h2>
      </div>
      <p className="text-foreground/80">
        This wizard will help you get your singles collection into beets. Here&apos;s what we&apos;ll do:
      </p>
      <ol className="list-decimal list-inside space-y-1 text-foreground/80">
        <li>Pick the folder that holds your singles</li>
        <li>Import it into beets (no autotag — fast, uses your existing tags)</li>
        <li>Clean up any files that failed to import</li>
        <li>Identify tracks against MusicBrainz (slow, skippable)</li>
        <li>Review and remove duplicate tracks</li>
        <li>Scrub stale tag frames from your files</li>
        <li>Drop you back on the library home page</li>
      </ol>
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={onNext}>
          Get started
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Library path
// --------------------------------------------------------------------------

function StepLibraryPath({ libraryPath, setLibraryPath, onNext, onBack }) {
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: updateBeetsLibraryDirectory,
    onSuccess: () => {
      setError(null);
      onNext();
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    const trimmed = libraryPath.trim();
    if (!trimmed) {
      setError("Please enter a path");
      return;
    }
    mutation.mutate(trimmed);
  };

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FolderOpen className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Library location
        </h2>
      </div>
      <p className="text-foreground/80">
        Where does your music live? This becomes the <code>directory</code> for your beets library.
      </p>
      <input
        type="text"
        value={libraryPath}
        onChange={(e) => {
          setLibraryPath(e.target.value);
          setError(null);
        }}
        placeholder="/Volumes/T7/DJ Library/Singles"
        className="w-full px-4 py-2 rounded-base border-base shadow-base bg-background text-foreground font-base text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-main"
      />
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="default" size="md" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          isDisabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Import (streams beet import output)
// --------------------------------------------------------------------------

function StepImport({ libraryPath, onNext }) {
  const [operationId, setOperationId] = useState(null);
  // Use a ref, not useState, to guard against React 18 strict-mode's
  // double-invocation of useEffect in dev. A state update wouldn't be visible
  // to the second effect run — both would see `started === false` and each
  // fire a `beet import`, duplicating every row in the library DB. A ref
  // updates synchronously, so the second run sees it and bails.
  const startedRef = useRef(false);
  const [retryError, setRetryError] = useState(null);

  const startMutation = useMutation({
    mutationFn: () => startBeetsImport(libraryPath),
    onSuccess: (data) => setOperationId(data.operationId),
  });

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: operation } = useOperationPolling(operationId);

  const status = operation?.status;
  const isRunning =
    status === "running" ||
    (!operation && startedRef.current && !operationId && startMutation.isPending);
  const isComplete = status === "completed";
  const isFailed = status === "failed" || startMutation.isError;

  const handleRetry = async () => {
    setRetryError(null);
    setOperationId(null);
    try {
      // Re-apply the beets config first — this is what unblocks the import
      // if the user was stuck on the lastgenre/wlg/timid errors.
      await updateBeetsLibraryDirectory(libraryPath);
      startMutation.mutate();
    } catch (err) {
      setRetryError(err.message);
    }
  };

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Download className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Importing library
        </h2>
      </div>

      {isRunning && (
        <div className="flex items-center gap-3 text-foreground/80">
          <Loader className="w-5 h-5 animate-spin text-main" />
          Running <code>beet import</code>... This can take a while for large libraries.
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
          <Check className="w-5 h-5" />
          <span className="font-heading">Import complete</span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="font-heading">
            Import failed: {operation?.error || startMutation.error?.message}
          </span>
        </div>
      )}

      {retryError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          Retry failed: {retryError}
        </div>
      )}

      {(operation?.output || isRunning) && (
        <pre className="card-brutalist p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto">
          {operation?.output || "Starting..."}
        </pre>
      )}

      <div className="flex justify-between">
        {isFailed ? (
          <Button
            variant="default"
            size="md"
            onClick={handleRetry}
            isDisabled={startMutation.isPending}
          >
            Retry
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="md"
          onClick={onNext}
          isDisabled={isRunning || !isComplete}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Cleanup unprocessed files
// --------------------------------------------------------------------------

function StepCleanup({ libraryPath, onNext, onSkip }) {
  const [files, setFiles] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deletedCount, setDeletedCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUnprocessedFiles(libraryPath)
      .then((data) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryPath]);

  const deleteMutation = useMutation({
    mutationFn: deleteUnprocessedFiles,
    onSuccess: (data) => {
      setDeletedCount(data.deleted.length);
      setFiles((prev) => (prev || []).filter((f) => !selected.has(f)));
      setSelected(new Set());
    },
  });

  const toggle = (path) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(files || []));
  };

  const clearAll = () => setSelected(new Set());

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Trash2 className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Cleanup unprocessed files
        </h2>
      </div>
      <p className="text-foreground/80">
        These audio files are in your library folder but weren&apos;t imported by beets. They&apos;re usually corrupted, unreadable, or unsupported formats.
      </p>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          {loadError}
        </div>
      )}

      {files === null && !loadError && (
        <div className="flex items-center gap-3 text-foreground/80">
          <Loader className="w-5 h-5 animate-spin text-main" />
          Scanning library folder...
        </div>
      )}

      {files && files.length === 0 && deletedCount === null && (
        <EmptyState
          icon={<Check className="w-12 h-12" />}
          heading="Nothing to clean up"
          description="Every audio file under your library folder is in the beets database."
        />
      )}

      {deletedCount !== null && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <Check className="w-4 h-4" />
          Deleted {deletedCount} file{deletedCount === 1 ? "" : "s"}.
        </div>
      )}

      {files && files.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground/60">
              {files.length} orphan file{files.length === 1 ? "" : "s"}
            </span>
            <Button variant="default" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="default" size="sm" onClick={clearAll}>
              Clear
            </Button>
          </div>
          <div className="card-brutalist p-3 max-h-80 overflow-y-auto space-y-1">
            {files.map((file) => (
              <label
                key={file}
                className="flex items-start gap-2 text-xs font-mono text-foreground/80 cursor-pointer hover:text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selected.has(file)}
                  onChange={() => toggle(file)}
                  className="mt-0.5"
                />
                <span className="break-all">{file}</span>
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => deleteMutation.mutate(Array.from(selected))}
            isDisabled={selected.size === 0 || deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? "Deleting..."
              : `Delete ${selected.size} selected`}
          </Button>
          {deleteMutation.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {deleteMutation.error.message}
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="default" size="md" onClick={onSkip}>
          Skip
        </Button>
        <Button variant="primary" size="md" onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Identify tracks on MusicBrainz
// --------------------------------------------------------------------------

function StepIdentify({ onNext, onBack }) {
  const [operationId, setOperationId] = useState(null);
  const [started, setStarted] = useState(false);

  const startMutation = useMutation({
    mutationFn: startBeetsIdentify,
    onSuccess: (data) => {
      setOperationId(data.operationId);
      setStarted(true);
    },
  });

  const { data: operation } = useOperationPolling(operationId);

  const status = operation?.status;
  const isRunning = started && (status === "running" || (!operation && !operationId));
  const isComplete = status === "completed";
  const isFailed = status === "failed" || startMutation.isError;

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Search className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Identify on MusicBrainz
        </h2>
      </div>
      <p className="text-foreground/80">
        Re-runs <code>beet import -L</code> against your whole library. beets queries MusicBrainz using each track&apos;s existing tags and applies canonical metadata where a confident match exists. Unmatched tracks are left exactly as they are.
      </p>
      <div className="card-brutalist p-3 space-y-2 text-sm text-foreground/80 bg-main/5">
        <div className="font-heading text-foreground">Heads up — this is slow and destructive</div>
        <ul className="list-disc list-inside space-y-1">
          <li>MusicBrainz rate-limits anonymous requests to ~1/second. Expect roughly one hour per ~3,500 tracks.</li>
          <li>For matched tracks, <strong>file tags on disk will be overwritten</strong> with MB&apos;s canonical values (title, artist, album, track numbers, year, MB IDs).</li>
          <li>Unmatched tracks stay untouched. You can skip this step and run it later from the CLI.</li>
          <li>You can leave this tab open and come back — the server keeps running.</li>
        </ul>
      </div>

      {isRunning && (
        <div className="flex items-center gap-3 text-foreground/80">
          <Loader className="w-5 h-5 animate-spin text-main" />
          Querying MusicBrainz... this will take a while.
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
          <Check className="w-5 h-5" />
          <span className="font-heading">Identify complete</span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="font-heading">
            Identify failed: {operation?.error || startMutation.error?.message}
          </span>
        </div>
      )}

      {(operation?.output || isRunning) && (
        <pre className="card-brutalist p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto">
          {operation?.output || "Starting..."}
        </pre>
      )}

      <div className="flex justify-between">
        <Button variant="default" size="md" onClick={onBack} isDisabled={isRunning}>
          Back
        </Button>
        <div className="flex gap-2">
          {!started && (
            <Button
              variant="default"
              size="md"
              onClick={onNext}
            >
              Skip
            </Button>
          )}
          {!started ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => startMutation.mutate()}
              isDisabled={startMutation.isPending}
            >
              {startMutation.isPending ? "Starting..." : "Start identify"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={onNext}
              isDisabled={isRunning || (!isComplete && !isFailed)}
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Duplicates
// --------------------------------------------------------------------------

function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function filenameOf(path) {
  if (!path) return "";
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function StepDuplicates({ onNext, onBack }) {
  const [groups, setGroups] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deletedCount, setDeletedCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchDuplicateGroups()
      .then((data) => {
        if (cancelled) return;
        setGroups(data.groups);
        // Default: preselect every non-keeper across every group.
        const preset = new Set();
        for (const g of data.groups) {
          for (const item of g.items) {
            if (!item.isKeeper) preset.add(item.id);
          }
        }
        setSelected(preset);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: deleteDuplicateTracks,
    onSuccess: (data) => {
      const deletedIds = new Set(data.deleted);
      setDeletedCount(data.deleted.length);
      setGroups((prev) =>
        (prev || [])
          .map((g) => ({
            ...g,
            items: g.items.filter((item) => !deletedIds.has(item.id)),
          }))
          .filter((g) => g.items.length >= 2)
      );
      setSelected(new Set());
    },
  });

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllNonKeepers = () => {
    const next = new Set();
    for (const g of groups || []) {
      for (const item of g.items) {
        if (!item.isKeeper) next.add(item.id);
      }
    }
    setSelected(next);
  };

  const clearAll = () => setSelected(new Set());

  const totalFiles = (groups || []).reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Copy className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Review duplicates
        </h2>
      </div>
      <p className="text-foreground/80">
        beets found these groups of tracks that share artist, album, title, and length. Only well-tagged items are checked — untagged files are skipped so you don&apos;t get false positives. The highest-bitrate copy in each group is marked as the keeper by default.
      </p>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          {loadError}
        </div>
      )}

      {groups === null && !loadError && (
        <div className="flex items-center gap-3 text-foreground/80">
          <Loader className="w-5 h-5 animate-spin text-main" />
          Scanning library for duplicates...
        </div>
      )}

      {deletedCount !== null && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <Check className="w-4 h-4" />
          Removed {deletedCount} track{deletedCount === 1 ? "" : "s"}.
        </div>
      )}

      {groups && groups.length === 0 && (
        <EmptyState
          icon={<Check className="w-12 h-12" />}
          heading="No duplicates found"
          description="beets didn't find any duplicate tracks in the well-tagged part of your library. Files without enough tag metadata are skipped."
        />
      )}

      {groups && groups.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-foreground/60">
              {groups.length} group{groups.length === 1 ? "" : "s"}, {totalFiles} file{totalFiles === 1 ? "" : "s"}
            </span>
            <Button variant="default" size="sm" onClick={selectAllNonKeepers}>
              Select all non-keepers
            </Button>
            <Button variant="default" size="sm" onClick={clearAll}>
              Clear
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                deleteMutation.mutate(Array.from(selected).map((n) => Number(n)))
              }
              isDisabled={selected.size === 0 || deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? "Deleting..."
                : `Delete ${selected.size} selected`}
            </Button>
          </div>
          <div className="space-y-3 max-h-[32rem] overflow-y-auto">
            {groups.map((group, idx) => (
              <div key={`${group.label}-${idx}`} className="card-brutalist p-3 space-y-2">
                <div className="text-sm font-heading text-foreground/80">
                  {group.label}{" "}
                  <span className="text-foreground/50 font-normal">
                    ({group.count} copies)
                  </span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 text-xs cursor-pointer hover:bg-main/5 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-foreground break-all">
                            {filenameOf(item.path)}
                          </span>
                          {item.isKeeper && (
                            <span className="px-2 py-0.5 rounded-base border-2 border-border bg-main text-main-foreground text-[10px] font-heading">
                              Keep (highest quality)
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-foreground/50 break-all">
                          {item.path}
                        </div>
                      </div>
                      <div className="text-right text-foreground/60 whitespace-nowrap font-mono">
                        {item.bitrate ? `${Math.round(item.bitrate / 1000)}kbps` : ""}
                        {item.format ? ` · ${item.format}` : ""}
                        {item.length ? ` · ${formatDuration(item.length)}` : ""}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {deleteMutation.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {deleteMutation.error.message}
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="default" size="md" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Scrub tags
// --------------------------------------------------------------------------

function StepScrub({ onNext }) {
  const [operationId, setOperationId] = useState(null);
  // Same guard as StepImport — prevents React 18 strict mode from firing
  // `beet scrub` twice in dev.
  const startedRef = useRef(false);

  const startMutation = useMutation({
    mutationFn: () => runBeetsPlugin("scrub"),
    onSuccess: (data) => setOperationId(data.operationId),
  });

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: operation } = useOperationPolling(operationId);

  const status = operation?.status;
  const isRunning =
    status === "running" ||
    (!operation && startedRef.current && !operationId && startMutation.isPending);
  const isComplete = status === "completed";
  const isFailed = status === "failed" || startMutation.isError;

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-main" />
        <h2 className="text-xl font-heading text-foreground">
          Scrubbing tags
        </h2>
      </div>
      <p className="text-foreground/80">
        Strips non-essential tag frames from files and re-writes clean tags from the beets database. This runs across every track in your library.
      </p>

      {isRunning && (
        <div className="flex items-center gap-3 text-foreground/80">
          <Loader className="w-5 h-5 animate-spin text-main" />
          Running <code>beet scrub</code>...
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
          <Check className="w-5 h-5" />
          <span className="font-heading">Scrub complete</span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="font-heading">
            Scrub failed: {operation?.error || startMutation.error?.message}
          </span>
        </div>
      )}

      {(operation?.output || isRunning) && (
        <pre className="card-brutalist p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto">
          {operation?.output || "Starting..."}
        </pre>
      )}

      <div className="flex justify-between">
        <Button
          variant="default"
          size="md"
          onClick={onNext}
          isDisabled={isRunning}
        >
          Skip
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onNext}
          isDisabled={isRunning || !isComplete}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step: Complete
// --------------------------------------------------------------------------

function StepComplete({ onFinish }) {
  return (
    <div className="card-brutalist p-6 space-y-4 text-center">
      <div className="flex justify-center">
        <PartyPopper className="w-12 h-12 text-main" />
      </div>
      <h2 className="text-xl font-heading text-foreground">
        Library ready
      </h2>
      <p className="text-foreground/80">
        Your singles are imported and cleaned up. Head to the library to start browsing.
      </p>
      <div className="flex justify-center">
        <Button variant="primary" size="md" onClick={onFinish}>
          Go to library
        </Button>
      </div>
    </div>
  );
}

export default SetupWizard;
