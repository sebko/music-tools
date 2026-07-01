import { useState } from "react";
import { useRestoreDatesPreview, useApplyRestoreDates } from "../hooks/useRestoreDates";
import { Button, PageHeader } from "@music-tools/my-component-library";
import { AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

function FilesToPlexPage() {
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const {
    data: previewData,
    isLoading: isLoadingPreview,
    error: previewError,
    refetch: refetchPreview,
  } = useRestoreDatesPreview({ enabled: previewEnabled });

  const {
    mutate: applyChanges,
    isPending: isApplying,
    data: applyResult,
    error: applyError,
    reset: resetApply,
  } = useApplyRestoreDates();

  const handlePreview = () => {
    resetApply();
    if (previewEnabled) {
      refetchPreview();
    } else {
      setPreviewEnabled(true);
    }
  };

  const handleApply = () => {
    applyChanges();
  };

  const summary = previewData?.summary;
  const changes = previewData?.changes;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Files → Plex Sync"
        subtitle="Restores each album's on-disk creation date (birthtime) as its Plex &quot;Date Added&quot; timestamp. Useful after a Plex library rescan resets all added dates. Albums whose folder and files have no plausible creation date are skipped rather than given a bogus date."
      />

      <div className="flex items-start gap-3 p-4 rounded-base border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-sm text-yellow-800 dark:text-yellow-200">
          <p className="font-heading">Plex Media Server must be stopped before applying changes.</p>
          <p className="mt-1 text-yellow-700 dark:text-yellow-300">
            This directly modifies the Plex database. A backup is created
            automatically before any changes are applied.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handlePreview}
          isLoading={isLoadingPreview}
          variant="secondary"
        >
          {isLoadingPreview ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Scanning...
            </>
          ) : (
            "Preview Changes"
          )}
        </Button>

        {summary && summary.toUpdate > 0 && !applyResult && (
          <Button
            onClick={handleApply}
            isLoading={isApplying}
            variant="primary"
          >
            {isApplying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Applying...
              </>
            ) : (
              `Apply ${summary.toUpdate} Changes`
            )}
          </Button>
        )}
      </div>

      {previewError && (
        <div className="p-4 rounded-base border-2 border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          Error: {previewError.message}
        </div>
      )}

      {applyError && (
        <div className="p-4 rounded-base border-2 border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          Error applying changes: {applyError.message}
        </div>
      )}

      {applyResult?.success && (
        <div className="flex items-start gap-3 p-4 rounded-base border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div className="text-sm text-green-800 dark:text-green-200">
            <p className="font-heading">{applyResult.message}</p>
            <p className="mt-1 text-green-700 dark:text-green-300">
              Backup saved. You can now start Plex Media Server.
            </p>
          </div>
        </div>
      )}

      {summary && (
        <div className="rounded-base border-2 border-border bg-background-secondary p-4 space-y-4">
          <h3 className="font-heading text-lg text-foreground">Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-heading text-foreground">
                {summary.total}
              </div>
              <div className="text-sm text-foreground/60">Total Albums</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-heading text-main">
                {summary.toUpdate}
              </div>
              <div className="text-sm text-foreground/60">To Update</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-heading text-green-600 dark:text-green-400">
                {summary.alreadyCorrect}
              </div>
              <div className="text-sm text-foreground/60">Already Correct</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-heading text-yellow-600 dark:text-yellow-400">
                {summary.missing}
              </div>
              <div className="text-sm text-foreground/60">Folders Missing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-heading text-orange-600 dark:text-orange-400">
                {summary.invalid ?? 0}
              </div>
              <div className="text-sm text-foreground/60">No Valid Date</div>
            </div>
          </div>

          {changes && changes.length > 0 && (
            <div>
              <h4 className="font-heading text-sm text-foreground/70 mb-2">
                Sample Changes (first {changes.length} of{" "}
                {previewData.totalChanges})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-heading text-foreground/70">
                        Album
                      </th>
                      <th className="text-left py-2 pr-4 font-heading text-foreground/70">
                        Current Date
                      </th>
                      <th className="text-left py-2 font-heading text-foreground/70">
                        Correct Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change) => (
                      <tr
                        key={change.id}
                        className="border-b border-border/50"
                      >
                        <td className="py-2 pr-4 text-foreground truncate max-w-[300px]">
                          {change.title}
                        </td>
                        <td className="py-2 pr-4 text-red-600 dark:text-red-400 font-mono text-xs">
                          {change.oldDate}
                        </td>
                        <td className="py-2 text-green-600 dark:text-green-400 font-mono text-xs">
                          {change.newDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FilesToPlexPage;
