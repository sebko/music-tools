import { Button } from "@music-tools/my-component-library";
import { Copy, Star } from "lucide-react";

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

/**
 * One group of files that duplicate each other within the same import batch.
 * Each file gets a Keep / Delete toggle; the recommended keeper (highest
 * bitrate → lossless → cleanest filename) is pre-selected as Keep and badged.
 * `decisions` maps file path → { action: "keep" | "delete" } for this group.
 */
export default function IntraBatchReviewCard({ group, decisions, onChange, inboxPath }) {
  const keptCount = group.files.filter(
    (f) => (decisions[f.file]?.action || "keep") !== "delete",
  ).length;
  const noneKept = keptCount === 0;

  return (
    <div className="card-brutalist p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Copy className="w-4 h-4 text-foreground/60 shrink-0" />
        <div className="font-heading text-sm text-foreground">{group.label}</div>
        <span className="text-xs font-mono text-foreground/50">
          {group.count} copies
        </span>
      </div>

      <ul className="space-y-2">
        {group.files.map((f) => {
          const action = decisions[f.file]?.action || (f.isKeeper ? "keep" : "delete");
          const displayName = inboxPath ? f.file.replace(inboxPath + "/", "") : f.file;
          const isDelete = action === "delete";
          return (
            <li
              key={f.file}
              className={`flex items-start gap-3 border-t border-border pt-3 ${
                isDelete ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div
                    className="font-mono text-xs text-foreground truncate"
                    title={displayName}
                  >
                    {displayName}
                  </div>
                  {f.isKeeper && (
                    <span className="flex items-center gap-0.5 text-[10px] font-heading text-foreground/60 shrink-0">
                      <Star className="w-3 h-3" />
                      best copy
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-foreground/60 flex gap-3">
                  <span>{f.format?.toUpperCase() || "?"}</span>
                  <span>{formatBitrate(f.bitrate)}</span>
                  <span>{formatLength(f.length)}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant={action === "keep" ? "primary" : "default"}
                  size="sm"
                  onClick={() => onChange(f.file, { action: "keep" })}
                >
                  Keep
                </Button>
                <Button
                  variant={action === "delete" ? "primary" : "default"}
                  size="sm"
                  onClick={() => onChange(f.file, { action: "delete" })}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {noneKept && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Keep at least one copy of this track.
        </div>
      )}
    </div>
  );
}
