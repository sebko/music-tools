import { Button } from "@dj-tools/my-component-library";
import { CheckCircle, AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

const STATUS_GROUPS = [
  { status: "COPIED", title: "Copied", tone: "text-green-600 dark:text-green-400" },
  {
    status: "SKIPPED_EXISTS",
    title: "Already in destination",
    tone: "text-muted-foreground",
  },
  { status: "FAILED", title: "Failed", tone: "text-red-600 dark:text-red-400" },
];

// Post-copy summary: per-status album lists from the copy run's results.
function SummaryStep({ progress, onKeepSwiping, onDone }) {
  const results = progress.results || [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-6 rounded-base border-2 border-border bg-background space-y-5">
        <div className="flex items-center gap-3">
          {progress.failed > 0 ? (
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          ) : (
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          )}
          <h2 className="font-heading text-lg text-foreground">
            {progress.copied} copied · {progress.skippedExists} already there ·{" "}
            {progress.failed} failed
          </h2>
        </div>

        {progress.scanTriggered && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4" /> Destination library scan triggered — new albums
            will appear in Plex shortly.
          </p>
        )}

        {progress.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{progress.error}</p>
        )}

        {STATUS_GROUPS.map(({ status, title, tone }) => {
          const group = results.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <div key={status} className="space-y-1.5">
              <h3 className={`text-sm font-heading ${tone}`}>
                {title} ({group.length})
              </h3>
              <ul className="text-sm text-foreground space-y-0.5 max-h-48 overflow-y-auto">
                {group.map((r) => (
                  <li key={r.ratingKey} className="truncate">
                    {r.artist} — {r.title}
                    {r.error && (
                      <span className="text-red-600 dark:text-red-400"> · {r.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-3">
        <Button onClick={onKeepSwiping} variant="secondary">
          <ArrowLeft className="w-4 h-4" /> Keep swiping
        </Button>
        <Button onClick={onDone} variant="primary">
          Done
        </Button>
      </div>
    </div>
  );
}

export default SummaryStep;
