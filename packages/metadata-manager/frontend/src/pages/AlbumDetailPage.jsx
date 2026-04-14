import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useAlbumTracks, useGenreStatus } from "../hooks/useAlbums";
import {
  PageLoader,
  DetailLayout,
  TrackList,
  EmptyState,
  Button,
} from "@dj-tools/my-component-library";
import { ArrowLeft, Music } from "lucide-react";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTotalDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dirname(p) {
  if (!p) return null;
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : p;
}

function uniqueValues(tracks, key) {
  const set = new Set();
  for (const t of tracks) {
    const v = t[key];
    if (v !== null && v !== undefined && v !== "") set.add(v);
  }
  return [...set];
}

function AlbumDetailPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const albumName = decodeURIComponent(name);
  const { data, isLoading, isError } = useAlbumTracks(albumName);

  const tracks = data?.tracks || [];
  const trackIds = useMemo(() => data?.tracks?.map((t) => t.id) || [], [data?.tracks]);
  const { data: genreStatus, isLoading: genreStatusLoading } = useGenreStatus(trackIds);

  if (isLoading) {
    return <PageLoader message="Loading album..." />;
  }

  if (isError || !tracks?.length) {
    return (
      <EmptyState
        icon={<Music className="w-16 h-16" />}
        heading="Album not found"
        description="This album doesn't exist or has no tracks."
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </Button>
        }
      />
    );
  }

  const first = tracks[0];
  const totalDuration = tracks.reduce(
    (sum, t) => sum + (t.durationSeconds || 0),
    0,
  );

  const albumArtist = first.albumartist || first.artist || "Unknown Artist";
  const formats = uniqueValues(tracks, "format");
  const bitrates = uniqueValues(tracks, "bitrate")
    .map(Number)
    .filter(Boolean);
  const sampleRates = uniqueValues(tracks, "samplerate")
    .map(Number)
    .filter(Boolean);
  const labels = uniqueValues(tracks, "label");

  let bitrateLabel = null;
  if (bitrates.length === 1) bitrateLabel = `${Math.round(bitrates[0] / 1000)} kbps`;
  else if (bitrates.length > 1) bitrateLabel = "variable";

  const sampleRateLabel =
    sampleRates.length === 1 ? `${(sampleRates[0] / 1000).toFixed(1)} kHz` : null;

  const showAlbumArtist =
    first.albumartist && first.albumartist !== first.artist;

  const trackListData = tracks.map((track) => {
    const status = genreStatus?.[track.id];
    let tags = undefined;

    if (status) {
      if (!status.hasGenres) {
        // No genres — no pills
        tags = undefined;
      } else if (!status.correctlyFormatted) {
        // Incorrectly formatted — warning pill
        tags = { warning: true };
      } else {
        // Correctly formatted — show genre pills
        tags = { values: status.genres };
      }
    }

    return {
      id: track.id,
      title: track.title || "Unknown Title",
      subtitle: track.artist || "",
      duration: track.durationSeconds,
      tags,
    };
  });

  return (
    <div>
      <div className="mb-6">
        <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <DetailLayout
        sidebar={
          <img
            src={first.artworkUrl}
            alt={albumName}
            className="w-full aspect-square object-cover rounded-base border-2 border-border bg-background-secondary"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        }
        sidebarWidth="w-full md:w-72"
        footer={
          <div className="mt-8">
            <h2 className="text-lg font-heading text-foreground mb-4">
              Track Listing
            </h2>
            {genreStatusLoading ? (
              <PageLoader message="Loading genres..." />
            ) : (
              <TrackList
                tracks={trackListData}
                formatDuration={(seconds) => formatDuration(seconds)}
              />
            )}
          </div>
        }
      >
        <h1 className="text-2xl font-heading text-foreground mb-2">
          {albumName}
        </h1>
        <p className="text-lg text-foreground/60 mb-4">{albumArtist}</p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-heading text-foreground/70">Year:</span>
            <span className="ml-2 text-foreground/60">
              {first.year || "Unknown"}
            </span>
          </div>

          {formatDate(first.addedAt) && (
            <div>
              <span className="font-heading text-foreground/70">Added:</span>
              <span className="ml-2 text-foreground/60">
                {formatDate(first.addedAt)}
              </span>
            </div>
          )}

          <div>
            <span className="font-heading text-foreground/70">Tracks:</span>
            <span className="ml-2 text-foreground/60">{tracks.length}</span>
          </div>

          <div>
            <span className="font-heading text-foreground/70">
              Total duration:
            </span>
            <span className="ml-2 text-foreground/60">
              {formatTotalDuration(totalDuration)}
            </span>
          </div>

          {formats.length > 0 && (
            <div>
              <span className="font-heading text-foreground/70">Format:</span>
              <span className="ml-2 text-foreground/60">
                {formats.join(", ")}
              </span>
            </div>
          )}

          {bitrateLabel && (
            <div>
              <span className="font-heading text-foreground/70">Bitrate:</span>
              <span className="ml-2 text-foreground/60">{bitrateLabel}</span>
            </div>
          )}

          {sampleRateLabel && (
            <div>
              <span className="font-heading text-foreground/70">
                Sample rate:
              </span>
              <span className="ml-2 text-foreground/60">
                {sampleRateLabel}
              </span>
            </div>
          )}

          {showAlbumArtist && (
            <div>
              <span className="font-heading text-foreground/70">
                Album Artist:
              </span>
              <span className="ml-2 text-foreground/60">
                {first.albumartist}
              </span>
            </div>
          )}

          {labels.length > 0 && (
            <div>
              <span className="font-heading text-foreground/70">Label:</span>
              <span className="ml-2 text-foreground/60">
                {labels.join(", ")}
              </span>
            </div>
          )}

          {first.path && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">Folder:</span>
              <span className="ml-2 text-foreground/60 font-mono text-xs break-all">
                {dirname(first.path)}
              </span>
            </div>
          )}

          {first.mb_albumid && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                MusicBrainz ID:
              </span>
              <span className="ml-2 text-foreground/60 font-mono text-xs break-all">
                {first.mb_albumid}
              </span>
            </div>
          )}
        </div>
      </DetailLayout>
    </div>
  );
}

export default AlbumDetailPage;
