import { useParams, Link } from "react-router-dom";
import { useAlbumTracks } from "../hooks/useAlbums";
import {
  PageLoader,
  PageHeader,
  DetailLayout,
  TrackList,
  EmptyState,
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

function AlbumDetailPage() {
  const { name } = useParams();
  const albumName = decodeURIComponent(name);
  const { data, isLoading, isError } = useAlbumTracks(albumName);

  if (isLoading) {
    return <PageLoader message="Loading album..." />;
  }

  if (isError || !data?.tracks?.length) {
    return (
      <EmptyState
        icon={<Music className="w-16 h-16" />}
        heading="Album not found"
        description="This album doesn't exist or has no tracks."
        action={
          <Link to="/" className="btn-brutalist">
            Back to Library
          </Link>
        }
      />
    );
  }

  const tracks = data.tracks;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.durationSeconds || 0), 0);
  const firstTrackWithArt = tracks[0];

  const trackListData = tracks.map((track) => ({
    id: track.id,
    title: track.title || "Unknown Title",
    subtitle: track.artist || "",
    duration: track.durationSeconds,
  }));

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-foreground/60 hover:text-foreground transition-colors"
              aria-label="Back to library"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {albumName}
          </div>
        }
        subtitle={`${tracks.length} tracks \u00b7 ${formatTotalDuration(totalDuration)}`}
      />

      <DetailLayout
        sidebar={
          <img
            src={firstTrackWithArt?.artworkUrl}
            alt={albumName}
            className="w-full aspect-square object-cover rounded-base border-2 border-border bg-background-secondary"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        }
        sidebarWidth="w-full md:w-72"
      >
        <TrackList
          tracks={trackListData}
          formatDuration={(seconds) => formatDuration(seconds)}
        />
      </DetailLayout>
    </div>
  );
}

export default AlbumDetailPage;
