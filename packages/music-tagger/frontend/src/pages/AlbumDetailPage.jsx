import { useParams, useNavigate } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { useRefreshAlbum } from "../hooks/useRefreshAlbum";
import { getAlbumArtworkUrl } from "../api/albums";
import { useState } from "react";
import { Button, cn } from "@dj-tools/my-component-library";
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
        <div className="text-gray-500 dark:text-gray-400">Loading album...</div>
      </div>
    );
  }

  if (isError || !album) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
          {error?.message === "Album not found"
            ? "Album not found"
            : "Error loading album"}
        </h2>
        {error && error.message !== "Album not found" && (
          <p className="text-red-500 dark:text-red-400 mb-4">{error.message}</p>
        )}
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
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

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
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
                <div className="text-gray-400 dark:text-gray-500">
                  <Music className="w-16 h-16" />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {album.title || "Unknown Album"}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
              {album.artist || "Unknown Artist"}
            </p>

            {/* Summary/Description */}
            {album.summary && (
              <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {album.summary}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* Basic Info */}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Year:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {album.year || "Unknown"}
                </span>
              </div>
              {album.originallyAvailableAt && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Release Date:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {formatDate(album.originallyAvailableAt)}
                  </span>
                </div>
              )}
              {album.studio && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Label:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.studio}
                  </span>
                </div>
              )}
              {album.rating && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Rating:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.rating}/10
                  </span>
                </div>
              )}

              {/* Genres */}
              {album.genres && album.genres.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Genres:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.genres.join(", ")}
                  </span>
                </div>
              )}

              {/* Styles */}
              {album.styles && album.styles.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Styles:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.styles.join(", ")}
                  </span>
                </div>
              )}

              {/* Moods */}
              {album.moods && album.moods.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Moods:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.moods.join(", ")}
                  </span>
                </div>
              )}

              {/* Format */}
              {album.formats && album.formats.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Format:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.formats.join(", ")}
                  </span>
                </div>
              )}

              {/* Track counts */}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Tracks:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {album.trackCount || album.tracks?.length || 0}
                </span>
              </div>
              {album.viewedLeafCount > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Played Tracks:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.viewedLeafCount}
                  </span>
                </div>
              )}

              {/* Plex Match Status */}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Plex Match Status:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {album.matched ? "Matched" : "Unmatched"}
                </span>
              </div>

              {/* Dates */}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Date Added:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {formatDate(album.addedAt)}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Last Updated:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {formatDate(album.updatedAt)}
                </span>
              </div>

              {/* Library Info */}
              {album.librarySectionTitle && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Library:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    {album.librarySectionTitle}
                  </span>
                </div>
              )}

              {/* File Path */}
              {album.location && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    File Path:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400 font-mono text-xs break-all">
                    {album.location}
                  </span>
                </div>
              )}

              {/* IDs */}
              {album.musicbrainzId && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
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
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Plex IDs:
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                  Album: {album.id} | Artist: {album.artistId}
                </span>
              </div>
              {album.guid && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Plex GUID:
                  </span>
                  <span className="ml-2 text-gray-600 dark:text-gray-400 font-mono text-xs break-all">
                    {album.guid}
                  </span>
                </div>
              )}

              {/* External Metadata Services */}
              <div className="col-span-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  External Metadata:
                </span>
                {album.metadataMatches && album.metadataMatches.length > 0 ? (
                  <span className="ml-2">
                    {album.metadataMatches.map((match, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 mr-2 mb-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600"
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
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    None
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {album.tracks && album.tracks.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Track Listing
            </h2>
            <div className="space-y-2">
              {album.tracks.map((track, index) => (
                <div
                  key={track.id || index}
                  className="flex items-center py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                >
                  <span className="w-8 text-sm text-gray-500 dark:text-gray-400">
                    {track.trackNumber || index + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-gray-900 dark:text-white">
                      {track.title || "Unknown Track"}
                    </div>
                    {track.artist && track.artist !== album.artist && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {track.artist}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-4 font-mono">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
