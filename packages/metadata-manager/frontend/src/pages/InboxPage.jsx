import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  PageLoader,
  Button,
  EmptyState,
} from "@dj-tools/my-component-library";
import {
  Inbox,
  RefreshCw,
  Play,
  Check,
  AlertCircle,
  Loader,
  FolderOpen,
} from "lucide-react";
import { fetchInboxStatus, runInboxImport } from "../api/inbox";
import { useOperationPolling } from "../hooks/useOperationPolling";

const PHASE_LABELS = {
  importing: "Importing files with beets",
  tagging: "Normalizing tags",
  artwork: "Embedding artwork",
  updating: "Syncing beets database",
  done: "Complete",
};

function InboxPage() {
  const queryClient = useQueryClient();
  const [operationId, setOperationId] = useState(null);
  const [showLog, setShowLog] = useState(false);

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
  const isRunning = status === "running" || (hasStarted && !operation);
  const isComplete = status === "completed";
  const isFailed = status === "failed" || startMutation.isError;

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
    startMutation.reset();
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
    content = (
      <div className="card-brutalist p-6 space-y-4">
        <div className="flex items-center gap-3">
          {isComplete ? (
            <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
          ) : isFailed ? (
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          ) : (
            <Loader className="w-6 h-6 animate-spin text-main" />
          )}
          <h2 className="text-xl font-heading text-foreground">
            {isComplete ? "Import complete" : isFailed ? "Import failed" : phaseLabel}
          </h2>
        </div>

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
