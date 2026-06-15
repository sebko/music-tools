import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { startGenreTag, fetchOperation } from "../api/beets";
import {
  PageHeader,
  Toolbar,
  Button,
  EmptyState,
} from "@music-tools/my-component-library";
import { Sparkles, CheckCircle, AlertCircle, Loader } from "lucide-react";

function GenresPage() {
  const [sqlFilter, setSqlFilter] = useState("");
  const [operationId, setOperationId] = useState(null);

  const tagMutation = useMutation({
    mutationFn: startGenreTag,
    onSuccess: (data) => setOperationId(data.operationId),
  });

  const { data: operation } = useQuery({
    queryKey: ["operation", operationId],
    queryFn: () => fetchOperation(operationId),
    enabled: !!operationId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" ? 1000 : false;
    },
  });

  const isRunning = operation?.status === "running";
  const isComplete = operation?.status === "completed";
  const isFailed = operation?.status === "failed";

  const handleRun = (dryRun) => {
    tagMutation.mutate({
      query: sqlFilter.trim() || undefined,
      dryRun,
    });
  };

  const handleReset = () => {
    setOperationId(null);
    tagMutation.reset();
  };

  return (
    <div>
      <PageHeader
        title="Genre Tagger"
        subtitle="Use Claude AI to assign specific genres to your tracks"
      >
        <Toolbar
          right={
            <div className="flex items-center gap-3">
              {!isRunning && (
                <>
                  <Button
                    onClick={() => handleRun(true)}
                    variant="default"
                    size="sm"
                    isDisabled={tagMutation.isPending}
                  >
                    Dry Run
                  </Button>
                  <Button
                    onClick={() => handleRun(false)}
                    variant="primary"
                    size="sm"
                    isDisabled={tagMutation.isPending}
                  >
                    <Sparkles className="w-4 h-4" />
                    Tag Genres
                  </Button>
                </>
              )}
            </div>
          }
        />
      </PageHeader>

      <div className="space-y-6">
        {/* Filter input */}
        <div className="card-brutalist p-4">
          <label
            htmlFor="sql-filter"
            className="block text-sm font-heading text-foreground mb-2"
          >
            SQL Filter (optional)
          </label>
          <input
            id="sql-filter"
            type="text"
            value={sqlFilter}
            onChange={(e) => setSqlFilter(e.target.value)}
            placeholder='e.g. genres IS NULL OR genres = ""'
            className="w-full px-3 py-2 bg-background border-2 border-border rounded-base text-foreground font-body placeholder:text-foreground/40 focus:outline-none focus:border-main"
            disabled={isRunning}
          />
          <p className="text-xs text-foreground/50 mt-1">
            Leave empty to process all tracks. Use SQL WHERE syntax to filter.
          </p>
        </div>

        {/* Status */}
        {isRunning && (
          <div className="card-brutalist p-6 flex items-center gap-4">
            <Loader className="w-6 h-6 text-main animate-spin" />
            <div>
              <div className="font-heading text-foreground">Running genre tagger...</div>
              <div className="text-sm text-foreground/60">
                Claude is analyzing your tracks and assigning genres. This may take a minute.
              </div>
            </div>
          </div>
        )}

        {isComplete && operation?.output && (
          <div className="space-y-4">
            <div className="card-brutalist p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span className="font-heading text-foreground">Genre tagging complete</span>
              <Button onClick={handleReset} variant="default" size="sm" className="ml-auto">
                Run Again
              </Button>
            </div>
            <pre className="card-brutalist p-4 text-sm font-mono text-foreground/80 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {operation.output}
            </pre>
          </div>
        )}

        {isFailed && (
          <div className="space-y-4">
            <div className="card-brutalist p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="font-heading text-foreground">Genre tagging failed</span>
              <Button onClick={handleReset} variant="default" size="sm" className="ml-auto">
                Try Again
              </Button>
            </div>
            {operation?.error && (
              <pre className="card-brutalist p-4 text-sm font-mono text-red-400 whitespace-pre-wrap">
                {operation.error}
              </pre>
            )}
          </div>
        )}

        {!operationId && !tagMutation.isPending && (
          <EmptyState
            icon={<Sparkles className="w-16 h-16" />}
            heading="Claude AI Genre Tagger"
            description="Sends your tracks to Claude Sonnet in batches of 40. Claude assigns 1-3 specific genres per track based on artist, title, and album metadata."
          />
        )}
      </div>
    </div>
  );
}

export default GenresPage;
