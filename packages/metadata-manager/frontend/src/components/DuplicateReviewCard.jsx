import { Button } from "@dj-tools/my-component-library";
import { Music, AlertTriangle } from "lucide-react";

const ACTION_LABELS = {
  skip_keep: "Skip — keep in inbox",
  skip_delete: "Skip — delete from inbox",
  replace: "Replace library copy",
  import_anyway: "Import as additional copy",
};

function formatBitrate(bps) {
  if (!bps) return "—";
  return `${Math.round(bps / 1000)} kbps`;
}

function formatLength(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatAdded(unixSeconds) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export default function DuplicateReviewCard({ duplicate, decision, onChange, inboxPath }) {
  const { file, artist, title, bitrate, format, length, matches } = duplicate;
  const displayName = inboxPath ? file.replace(inboxPath + "/", "") : file;
  const bestLibraryBitrate = Math.max(...matches.map((m) => m.bitrate || 0));
  const recommended =
    (bitrate || 0) > bestLibraryBitrate ? "replace" : "skip_delete";

  const action = decision?.action || recommended;
  const replaceIds = decision?.replaceIds || matches.map((m) => m.id);

  const setAction = (next) => {
    onChange(file, {
      action: next,
      replaceIds: next === "replace" ? replaceIds : undefined,
    });
  };

  const toggleReplaceId = (id) => {
    const set = new Set(replaceIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(file, {
      action,
      replaceIds: [...set],
    });
  };

  const replaceDisabled = action === "replace" && replaceIds.length === 0;

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-foreground/60 shrink-0" />
            <div className="font-mono text-sm text-foreground truncate" title={displayName}>
              {displayName}
            </div>
          </div>
          <div className="text-xs text-foreground/70">
            <span className="font-heading">{artist}</span>
            <span className="text-foreground/40"> — </span>
            <span>{title}</span>
          </div>
          <div className="text-xs font-mono text-foreground/60 flex gap-3">
            <span>{format?.toUpperCase() || "?"}</span>
            <span>{formatBitrate(bitrate)}</span>
            <span>{formatLength(length)}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-heading text-foreground/70">
          <AlertTriangle className="w-3 h-3" />
          {matches.length} match{matches.length === 1 ? "" : "es"} already in library
        </div>
        <ul className="space-y-2">
          {matches.map((m) => {
            const checked = action === "replace" && replaceIds.includes(m.id);
            const showCheckbox = action === "replace";
            return (
              <li
                key={m.id}
                className="flex items-start gap-3 text-xs text-foreground/80"
              >
                {showCheckbox ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleReplaceId(m.id)}
                    className="mt-0.5 shrink-0"
                    aria-label={`Replace ${m.title}`}
                  />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-mono truncate" title={m.path}>
                    {m.path}
                  </div>
                  <div className="text-foreground/60 flex gap-3 font-mono mt-0.5">
                    <span>{m.album || "(no album)"}</span>
                    <span>{m.format?.toUpperCase()}</span>
                    <span>{formatBitrate(m.bitrate)}</span>
                    <span>{formatLength(m.length)}</span>
                    <span>added {formatAdded(m.added)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-xs font-heading text-foreground/70 mb-2">Action</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACTION_LABELS).map(([value, label]) => {
            const isActive = action === value;
            const isRecommended = recommended === value;
            return (
              <Button
                key={value}
                variant={isActive ? "primary" : "default"}
                size="sm"
                onClick={() => setAction(value)}
              >
                {label}
                {isRecommended && (
                  <span className="ml-1 text-[10px] opacity-70">★</span>
                )}
              </Button>
            );
          })}
        </div>
        {replaceDisabled && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Select at least one library copy to replace, or pick a different action.
          </div>
        )}
      </div>
    </div>
  );
}
