import { useParams, useNavigate } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { useRefreshAlbum } from "../hooks/useRefreshAlbum";
import { getAlbumArtworkUrl } from "../api/albums";
import { useState } from "react";
import { Button, cn, DetailLayout, TrackList, EmptyState, TagPill } from "@dj-tools/my-component-library";
import Lightbox from "../components/Lightbox";
import ArtworkSearchModal from "../components/ArtworkSearchModal";
import ExternalMetadataLink from "../components/ExternalMetadataLink";
import { Music, RefreshCw, ArrowLeft, Search, ZoomIn } from "lucide-react";

// Helper function to format date
function formatDate(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Helper function to format duration from milliseconds to MM:SS
function formatDuration(ms) {
  if (!ms) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AlbumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: album, isLoading, isError, error } = useAlbum(id);
  const refreshAlbumMutation = useRefreshAlbum(id);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);
  const [_selectedArtwork, _setSelectedArtwork] = useState(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/40">Loading album...</div>
      </div>
    );
  }

  if (isError || !album) {
    return (
      <EmptyState
        heading={
          error?.message === "Album not found"
            ? "Album not found"
            : "Error loading album"
        }
        description={error && error.message !== "Album not found" ? error.message : undefined}
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
    );
  }

  const handleArtworkSelect = (artworkData) => {
    _setSelectedArtwork(artworkData);
    console.log('Artwork selected:', artworkData);
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate(`/albums/${id}/metadata-search`, {
              state: { services: ["redacted"] },
            })}
            variant="primary"
            size="sm"
          >
            <Search className="h-4 w-4" />
            Scan Metadata
          </Button>
          <Button
            onClick={() => {
              refreshAlbumMutation.mutate();
            }}
            variant="default"
            size="sm"
            isDisabled={refreshAlbumMutation.isPending}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                refreshAlbumMutation.isPending && "animate-spin"
              )}
            />
            {refreshAlbumMutation.isPending ? "Refreshing..." : "Refresh Album"}
          </Button>
        </div>
      </div>

      <DetailLayout
        sidebar={
          <div className="aspect-square bg-background-secondary rounded-base flex items-center justify-center overflow-hidden border-2 border-border">
            {album.hasArtwork ? (
              <div
                className="relative group w-full h-full cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              >
                <img
                  src={getAlbumArtworkUrl(album.id)}
                  alt={album.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextElementSibling.nextElementSibling.style.display =
                      "flex";
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    className={cn(
                      "p-1.5 rounded-base",
                      "bg-black/60 text-white backdrop-blur-sm",
                      "opacity-0 group-hover:opacity-100 transition-all duration-200",
                      "hover:bg-black/80 hover:scale-110",
                      "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2",
                      "w-7 h-7 flex items-center justify-center"
                    )}
                    aria-label="Search for artwork"
                    title="Search for artwork"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArtworkModalOpen(true);
                    }}
                  >
                    <Search className="w-3 h-3" />
                  </button>
                  <button
                    className={cn(
                      "p-1.5 rounded-base",
                      "bg-black/60 text-white backdrop-blur-sm",
                      "opacity-0 group-hover:opacity-100 transition-all duration-200",
                      "hover:bg-black/80 hover:scale-110",
                      "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2",
                      "w-7 h-7 flex items-center justify-center"
                    )}
                    aria-label="View artwork fullscreen"
                    title="View artwork fullscreen"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxOpen(true);
                    }}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-foreground/30">
                <Music className="w-16 h-16" />
              </div>
            )}
          </div>
        }
        footer={
          album.tracks && album.tracks.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-heading text-foreground mb-4">
                Track Listing
              </h2>
              <TrackList
                tracks={album.tracks.map((track, index) => ({
                  id: track.id || index,
                  trackNumber: track.trackNumber || index + 1,
                  title: track.title || "Unknown Track",
                  subtitle: track.artist && track.artist !== album.artist ? track.artist : undefined,
                  duration: track.duration,
                }))}
                formatDuration={formatDuration}
              />
            </div>
          )
        }
      >
        <h1 className="text-2xl font-heading text-foreground mb-2">
          {album.title || "Unknown Album"}
        </h1>
        <p className="text-lg text-foreground/60 mb-4">
          {album.artist || "Unknown Artist"}
        </p>

        {/* Summary/Description */}
        {album.summary && (
          <div className="mb-6 pb-6 border-b border-border">
            <h3 className="text-sm font-heading text-foreground/70 mb-2">
              Description
            </h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {album.summary}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Basic Info */}
          <div>
            <span className="font-heading text-foreground/70">
              Year:
            </span>
            <span className="ml-2 text-foreground/60">
              {album.year || "Unknown"}
            </span>
          </div>
          {album.originallyAvailableAt && (
            <div>
              <span className="font-heading text-foreground/70">
                Release Date:
              </span>
              <span className="ml-2 text-foreground/60">
                {formatDate(album.originallyAvailableAt)}
              </span>
            </div>
          )}
          {album.studio && (
            <div>
              <span className="font-heading text-foreground/70">
                Label:
              </span>
              <span className="ml-2 text-foreground/60">
                {album.studio}
              </span>
            </div>
          )}
          {album.rating && (
            <div>
              <span className="font-heading text-foreground/70">
                Rating:
              </span>
              <span className="ml-2 text-foreground/60">
                {album.rating}/10
              </span>
            </div>
          )}

          {/* Genres */}
          {album.genres && album.genres.length > 0 && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                Genres:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...album.genres]
                  .sort((a, b) =>
                    a.localeCompare(b, undefined, { sensitivity: "base" })
                  )
                  .map((tag, i) => (
                    <TagPill key={i} label={tag} isNew={false} />
                  ))}
              </div>
            </div>
          )}

          {/* Styles */}
          {album.styles && album.styles.length > 0 && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                Styles:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...album.styles]
                  .sort((a, b) =>
                    a.localeCompare(b, undefined, { sensitivity: "base" })
                  )
                  .map((tag, i) => (
                    <TagPill key={i} label={tag} isNew={false} />
                  ))}
              </div>
            </div>
          )}

          {/* Moods */}
          {album.moods && album.moods.length > 0 && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                Moods:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...album.moods]
                  .sort((a, b) =>
                    a.localeCompare(b, undefined, { sensitivity: "base" })
                  )
                  .map((tag, i) => (
                    <TagPill key={i} label={tag} isNew={false} />
                  ))}
              </div>
            </div>
          )}

          {/* Format */}
          {album.formats && album.formats.length > 0 && (
            <div>
              <span className="font-heading text-foreground/70">
                Format:
              </span>
              <span className="ml-2 text-foreground/60">
                {album.formats.join(", ")}
              </span>
            </div>
          )}

          {/* Track counts */}
          <div>
            <span className="font-heading text-foreground/70">
              Tracks:
            </span>
            <span className="ml-2 text-foreground/60">
              {album.trackCount || album.tracks?.length || 0}
            </span>
          </div>
          {album.viewedLeafCount > 0 && (
            <div>
              <span className="font-heading text-foreground/70">
                Played Tracks:
              </span>
              <span className="ml-2 text-foreground/60">
                {album.viewedLeafCount}
              </span>
            </div>
          )}

          {/* Plex Match Status */}
          <div>
            <span className="font-heading text-foreground/70">
              Plex Match Status:
            </span>
            <span className="ml-2 text-foreground/60">
              {album.matched ? "Matched" : "Unmatched"}
            </span>
          </div>

          {/* Dates */}
          <div>
            <span className="font-heading text-foreground/70">
              Date Added:
            </span>
            <span className="ml-2 text-foreground/60">
              {formatDate(album.addedAt)}
            </span>
          </div>
          <div>
            <span className="font-heading text-foreground/70">
              Last Updated:
            </span>
            <span className="ml-2 text-foreground/60">
              {formatDate(album.updatedAt)}
            </span>
          </div>

          {/* Library Info */}
          {album.librarySectionTitle && (
            <div>
              <span className="font-heading text-foreground/70">
                Library:
              </span>
              <span className="ml-2 text-foreground/60">
                {album.librarySectionTitle}
              </span>
            </div>
          )}

          {/* File Path */}
          {album.location && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                File Path:
              </span>
              <span className="ml-2 text-foreground/60 font-mono text-xs break-all">
                {album.location}
              </span>
            </div>
          )}

          {/* IDs */}
          {album.musicbrainzId && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                MusicBrainz ID:
              </span>
              <span className="ml-2">
                <ExternalMetadataLink
                  service="musicbrainz"
                  externalId={album.musicbrainzId}
                />
              </span>
            </div>
          )}
          <div className="col-span-2">
            <span className="font-heading text-foreground/70">
              Plex IDs:
            </span>
            <span className="ml-2 text-foreground/60 font-mono text-xs">
              Album: {album.id} | Artist: {album.artistId}
            </span>
          </div>
          {album.guid && (
            <div className="col-span-2">
              <span className="font-heading text-foreground/70">
                Plex GUID:
              </span>
              <span className="ml-2 text-foreground/60 font-mono text-xs break-all">
                {album.guid}
              </span>
            </div>
          )}

          {/* External Metadata Services */}
          <div className="col-span-2">
            <span className="font-heading text-foreground/70">
              External Metadata:
            </span>
            {album.metadataMatches && album.metadataMatches.length > 0 ? (
              <span className="ml-2">
                {album.metadataMatches.map((match, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 mr-2 mb-1 text-xs bg-background-secondary text-foreground/70 rounded-base border-2 border-border"
                  >
                    <span className="capitalize">{match.service}:</span>
                    <span className="ml-1">
                      <ExternalMetadataLink
                        service={match.service}
                        externalId={match.externalId}
                      />
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="ml-2 text-foreground/60">
                None
              </span>
            )}
          </div>
        </div>
      </DetailLayout>

      {lightboxOpen && album.hasArtwork && (
        <Lightbox
          items={[{ source: "album", url: getAlbumArtworkUrl(album.id) }]}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <ArtworkSearchModal
        isOpen={artworkModalOpen}
        onClose={() => setArtworkModalOpen(false)}
        albumId={id}
        onSelectArtwork={handleArtworkSelect}
      />
    </div>
  );
}

export default AlbumDetailPage;
