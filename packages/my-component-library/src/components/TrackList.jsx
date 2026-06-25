import { cn } from "../lib/utils";
import { TagPill } from "./TagPill";

/**
 * Track listing for album/single detail views
 * @param {Object} props
 * @param {Array<{
 *   id?: string|number,
 *   trackNumber?: number,
 *   title: string,
 *   subtitle?: string,
 *   duration?: string,
 *   tags?: { values?: string[], warning?: boolean }
 * }>} props.tracks
 * @param {function} [props.formatDuration] - Custom duration formatter (receives raw value)
 * @param {function} [props.onTrackClick] - (track, index) => void
 * @param {string} [props.className]
 */
function TrackList({ tracks, formatDuration, onTrackClick, className }) {
  return (
    <div className={cn("space-y-1", className)}>
      {tracks.map((track, index) => (
        <div
          key={track.id || index}
          className={cn(
            "flex items-center py-2 px-3 rounded-base transition-colors",
            "hover:bg-background-secondary",
            onTrackClick && "cursor-pointer"
          )}
          onClick={onTrackClick ? () => onTrackClick(track, index) : undefined}
        >
          <span className="w-8 text-sm text-foreground/40 tabular-nums">
            {track.trackNumber || index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-foreground truncate">{track.title}</div>
            {track.subtitle && (
              <div className="text-xs text-foreground/60 truncate">{track.subtitle}</div>
            )}
          </div>
          {track.tags && (
            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
              {track.tags.warning ? (
                <TagPill label="Fix genres" variant="warning" />
              ) : (
                track.tags.values?.map((tag) => (
                  <TagPill key={tag} label={tag} />
                ))
              )}
            </div>
          )}
          {track.duration && (
            <span className="text-sm text-foreground/40 ml-4 font-mono tabular-nums">
              {formatDuration ? formatDuration(track.duration) : track.duration}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default TrackList;
