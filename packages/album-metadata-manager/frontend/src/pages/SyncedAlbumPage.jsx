import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { useAlbumNavigation } from "../hooks/useAlbumNavigation";
import { Button, cn, EmptyState, MetadataRow, GenreStylesRow } from "@music-tools/my-component-library";
import Lightbox from "../components/Lightbox";
import { InfoTagRow } from "../components/metadata";
import { ArrowLeft, ChevronLeft, ChevronRight, Music, ZoomIn, ExternalLink } from "lucide-react";
import { formatRedactedTags } from "../utils/formatters";
import { getMetadataServiceUrl } from "../utils/metadataLinks";
import { isHighResArtwork } from "../utils/syncStatus";

/**
 * Read-only review page for an already-synced album.
 *
 * Reached from the "Synced" tab (route: /albums/:id/synced/:groupId). It shows the
 * same Plex-vs-Redacted comparison as SyncMetadataPage but with every sync control
 * removed — no checkboxes, no artwork search/select/upload, no sync button. It is a
 * pure review of what was applied. The sync *action* lives on SyncMetadataPage
 * (/albums/:id/sync/:groupId), reached from the "Matched" tab.
 *
 * The display sub-components below are intentionally duplicated from
 * SyncMetadataPage so the two pages can evolve independently.
 */
function SyncedAlbumPage() {
  const { id, groupId } = useParams();
  const navigate = useNavigate();
  const { data: localAlbum, isLoading: localLoading } = useAlbum(id);

  // Album navigation for prev/next
  const {
    prevAlbum,
    nextAlbum,
    currentIndex,
    totalMatched,
    isLoading: isNavLoading,
  } = useAlbumNavigation(id);

  const [redactedData, setRedactedData] = useState(null);
  const [isLoadingMT, setIsLoadingMT] = useState(false);
  const [error, setError] = useState(null);

  // Lightbox state (viewing artwork fullscreen is allowed — it's not a sync action)
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Artwork dimensions state for resolution overlay
  const [localDimensions, setLocalDimensions] = useState(null);
  const [redactedDimensions, setRedactedDimensions] = useState(null);

  // Fetch Redacted data
  useEffect(() => {
    async function fetchRedactedData() {
      setIsLoadingMT(true);
      setError(null);

      try {
        const response = await fetch(`/api/metadata/redacted/${groupId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch Redacted data");
        }
        const result = await response.json();
        setRedactedData(result.data);
      } catch (err) {
        console.error("Error fetching Redacted data:", err);
        setError(err.message);
      } finally {
        setIsLoadingMT(false);
      }
    }

    if (groupId) {
      fetchRedactedData();
    }
  }, [groupId]);

  // Reset artwork dimensions when album changes
  useEffect(() => {
    setLocalDimensions(null);
    setRedactedDimensions(null);
  }, [id]);

  // Keyboard navigation with arrow keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key === "ArrowLeft" && prevAlbum) {
        navigate(`/albums/${prevAlbum.id}/synced/${prevAlbum.redactedId}`);
      } else if (e.key === "ArrowRight" && nextAlbum) {
        navigate(`/albums/${nextAlbum.id}/synced/${nextAlbum.redactedId}`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevAlbum, nextAlbum, navigate]);

  if (localLoading || isLoadingMT) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/60">Loading album...</div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        heading="Error Loading Data"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
    );
  }

  if (!localAlbum || !redactedData) {
    return (
      <EmptyState
        heading="Data not found"
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {/* Album Navigation */}
          {totalMatched > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => prevAlbum && navigate(`/albums/${prevAlbum.id}/synced/${prevAlbum.redactedId}`)}
                isDisabled={!prevAlbum || isNavLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>

              <span className="text-sm text-foreground/60 min-w-[60px] text-center">
                {currentIndex !== null ? `${currentIndex + 1} / ${totalMatched}` : "..."}
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => nextAlbum && navigate(`/albums/${nextAlbum.id}/synced/${nextAlbum.redactedId}`)}
                isDisabled={!nextAlbum || isNavLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-heading text-foreground mb-2">
          Synced Album
        </h1>
        <p className="text-foreground/60">
          Review the metadata applied to this album from its Redacted match
        </p>

        {/* Status Indicators */}
        <div className="flex gap-3 mt-4">
          {/* Sync Status Badge */}
          {(() => {
            const syncedFields = localAlbum.redactedSyncedFields;

            if (!syncedFields) {
              return (
                <div className="px-3 py-1.5 rounded-base border-2 text-sm font-heading bg-gray-100 border-gray-400 text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400">
                  Not yet synced
                </div>
              );
            }

            const fieldKeys = Object.keys(syncedFields);
            const syncedCount = fieldKeys.filter((k) => syncedFields[k] === true).length;
            const totalFields = fieldKeys.length;
            const allSynced = totalFields > 0 && syncedCount === totalFields;

            return (
              <div
                className={cn(
                  "px-3 py-1.5 rounded-base border-2 text-sm font-heading",
                  allSynced
                    ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                )}
              >
                {allSynced ? "✓ All fields synced" : `${syncedCount}/${totalFields} fields synced`}
              </div>
            );
          })()}

          {/* Artwork Quality Badge */}
          {(() => {
            const isHighQuality =
              localDimensions &&
              isHighResArtwork(localDimensions.width, localDimensions.height);
            const hasArtwork = localAlbum.hasArtwork && localDimensions;

            if (!localAlbum.hasArtwork) {
              return (
                <div className="px-3 py-1.5 rounded-base border-2 text-sm font-heading bg-red-100 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                  No artwork
                </div>
              );
            }

            return (
              <div
                className={cn(
                  "px-3 py-1.5 rounded-base border-2 text-sm font-heading",
                  isHighQuality
                    ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : hasArtwork
                    ? "bg-orange-100 border-orange-500 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                    : "bg-gray-100 border-gray-400 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                {isHighQuality
                  ? "✓ High-res artwork"
                  : hasArtwork
                  ? `Artwork: ${localDimensions.width}×${localDimensions.height}`
                  : "Loading..."}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Album Artwork Comparison (display only) */}
      <div className="card-brutalist p-6 mb-6">
        <h3 className="text-sm font-heading text-foreground uppercase tracking-wide mb-4">
          Album Artwork
        </h3>
        <div className="flex gap-8 justify-center items-start flex-wrap">
          {/* Local Album Artwork */}
          <div className="flex flex-col items-center">
            <h3 className="text-sm font-heading text-foreground mb-3">Your Local Album</h3>
            {localAlbum.hasArtwork ? (
              <div
                className="relative group w-[200px] h-[200px] cursor-pointer"
                onClick={() => {
                  setLightboxIndex(0);
                  setLightboxOpen(true);
                }}
              >
                <img
                  src={`/api/albums/${id}/artwork`}
                  alt={localAlbum.title || "Album artwork"}
                  className="w-full h-full object-cover rounded-base border-2 border-border shadow-base"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setLocalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  }}
                />
                <button
                  className={cn(
                    "absolute top-2 right-2 p-1.5 rounded-base",
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
                    setLightboxIndex(0);
                    setLightboxOpen(true);
                  }}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <ResolutionBadge width={localDimensions?.width} height={localDimensions?.height} />
              </div>
            ) : (
              <div className="w-[200px] h-[200px] bg-background-secondary rounded-base border-2 border-border shadow-base flex items-center justify-center">
                <Music className="w-16 h-16 text-foreground/30" />
              </div>
            )}
          </div>

          {/* Redacted Artwork */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-heading text-foreground">Redacted Match</h3>
              {groupId && (
                <a
                  href={getMetadataServiceUrl("redacted", groupId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-main hover:text-main/80 transition-colors"
                  title="View on Redacted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            {redactedData.coverUrl ? (
              <div
                className="relative group w-[200px] h-[200px] cursor-pointer"
                onClick={() => {
                  setLightboxIndex(1);
                  setLightboxOpen(true);
                }}
              >
                <img
                  src={redactedData.coverUrl}
                  alt={redactedData.title || "Album artwork"}
                  className="w-full h-full object-cover rounded-base border-2 border-main shadow-main"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setRedactedDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  }}
                />
                <button
                  className={cn(
                    "absolute top-2 right-2 p-1.5 rounded-base",
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
                    setLightboxIndex(1);
                    setLightboxOpen(true);
                  }}
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <ResolutionBadge width={redactedDimensions?.width} height={redactedDimensions?.height} />
              </div>
            ) : (
              <div className="w-[200px] h-[200px] bg-background-secondary rounded-base border-2 border-main shadow-main flex items-center justify-center">
                <Music className="w-16 h-16 text-foreground/30" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata Comparison Table (display only — no checkboxes) */}
      <div className="card-brutalist p-6 mb-6">
        <div className="grid grid-cols-[auto_auto_1fr_1fr] gap-4">
          {/* Super Header Row */}
          <div className="font-heading text-foreground text-sm"></div>
          <div className="font-heading text-foreground text-sm"></div>
          <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2 mb-2 bg-background-secondary/50">
            Local
          </div>
          <div className="font-heading text-foreground text-sm text-center border-b-2 border-main pb-2 mb-2 bg-main/5">
            Remote
          </div>

          {/* Sub Header Row */}
          <div className="font-heading text-foreground text-sm"></div>
          <div className="font-heading text-foreground text-sm"></div>
          <div className="font-heading text-foreground text-xs text-center border-b border-border pb-2">
            Plex Metadata
          </div>
          <div className="font-heading text-foreground text-xs text-center border-b border-main pb-2">
            Redacted Match
          </div>

          {/* Album Title Row */}
          <MetadataRow label="Album" leftValue={localAlbum.title} rightValue={redactedData.title} />

          {/* Year Row */}
          <MetadataRow label="Year" leftValue={localAlbum.year} rightValue={redactedData.year} />

          {/* Genre Row */}
          <InfoTagRow label="Genre" values={localAlbum.genres} />

          {/* Style Row */}
          <GenreStylesRow
            label="Style"
            leftValues={localAlbum.styles || []}
            rightValues={formatRedactedTags(redactedData.tags)}
          />

          {/* Track Count Row */}
          <MetadataRow
            label="Track Count"
            leftValue={localAlbum.trackCount ? `${localAlbum.trackCount} tracks` : null}
            rightValue={redactedData.trackCount ? `${redactedData.trackCount} tracks` : null}
          />

          {/* Label Row */}
          {(redactedData.label || localAlbum.studio) && (
            <MetadataRow label="Label" leftValue={localAlbum.studio} rightValue={redactedData.label} />
          )}
        </div>
      </div>

      {/* Track Titles Comparison Card */}
      <TrackComparisonCard
        localTracks={localAlbum.tracks}
        remoteTracks={redactedData.trackList}
      />

      {/* Lightbox for fullscreen artwork comparison */}
      {lightboxOpen && (
        <Lightbox
          items={[
            ...(localAlbum.hasArtwork
              ? [{ source: "local", url: `/api/albums/${id}/artwork` }]
              : []),
            ...(redactedData.coverUrl
              ? [{ source: "redacted", url: redactedData.coverUrl }]
              : []),
          ]}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

// Helper component for displaying artwork resolution badge
function ResolutionBadge({ width, height }) {
  if (!width || !height) return null;
  return (
    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-base bg-black/70 text-white text-xs font-heading backdrop-blur-sm">
      {width}×{height}
    </div>
  );
}

/**
 * Decode HTML entities in a string (frontend version)
 * @param {string} text - Text containing HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  if (!text) return text;

  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&aacute;": "á",
    "&eacute;": "é",
    "&iacute;": "í",
    "&oacute;": "ó",
    "&uacute;": "ú",
    "&ntilde;": "ñ",
    "&Aacute;": "Á",
    "&Eacute;": "É",
    "&Iacute;": "Í",
    "&Oacute;": "Ó",
    "&Uacute;": "Ú",
    "&Ntilde;": "Ñ",
    "&uuml;": "ü",
    "&Uuml;": "Ü",
    "&ouml;": "ö",
    "&Ouml;": "Ö",
    "&auml;": "ä",
    "&Auml;": "Ä",
    "&ccedil;": "ç",
    "&Ccedil;": "Ç",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char);
  }

  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

/**
 * TrackComparisonCard - Displays side-by-side track title comparison
 */
function TrackComparisonCard({ localTracks = [], remoteTracks = [] }) {
  const parseRemoteTrackTitle = (filename) => {
    if (!filename) return null;
    const withoutExt = filename.replace(
      /\.(flac|mp3|wav|m4a|ogg|opus|aac|alac|ape|wv)$/i,
      ""
    );
    return decodeHtmlEntities(withoutExt);
  };

  const maxTrackCount = Math.max(localTracks.length, remoteTracks.length);

  const trackComparisons = [];
  for (let i = 0; i < maxTrackCount; i++) {
    const localTrack = localTracks[i];
    const remoteTrack = remoteTracks[i];

    trackComparisons.push({
      trackNumber: i + 1,
      localTitle: localTrack?.title || null,
      remoteTitle: parseRemoteTrackTitle(remoteTrack) || null,
    });
  }

  return (
    <div className="card-brutalist p-6 mb-6">
      <h2 className="text-lg font-heading text-foreground mb-4">
        Track Titles Comparison
      </h2>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-4">
        <div className="font-heading text-foreground text-sm py-2">#</div>
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2">
          Local Track Titles (Plex)
        </div>
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2">
          Remote Filenames (Redacted)
        </div>

        {trackComparisons.map((track) => (
          <TrackComparisonRow
            key={track.trackNumber}
            trackNumber={track.trackNumber}
            localTitle={track.localTitle}
            remoteTitle={track.remoteTitle}
          />
        ))}
      </div>
    </div>
  );
}

function TrackComparisonRow({ trackNumber, localTitle, remoteTitle }) {
  return (
    <>
      <div className="font-heading text-foreground text-xs py-2 text-center">
        {trackNumber}
      </div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {localTitle || "-"}
      </div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {remoteTitle || "-"}
      </div>
    </>
  );
}

export default SyncedAlbumPage;
