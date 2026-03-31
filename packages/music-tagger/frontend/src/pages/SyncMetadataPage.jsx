import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { useAlbumNavigation } from "../hooks/useAlbumNavigation";
import { Button, cn } from "@dj-tools/my-component-library";
import Lightbox from "../components/Lightbox";
import ArtworkSearchModal from "../components/ArtworkSearchModal";
import { MetadataRow, GenreStylesRow, InfoTagRow } from "../components/metadata";
import { ArrowLeft, ChevronLeft, ChevronRight, Music, ZoomIn, Search, ExternalLink } from "lucide-react";
import { formatRedactedTags } from "../utils/formatters";
import { getMetadataServiceUrl } from "../utils/metadataLinks";
import { isHighResArtwork } from "../utils/syncStatus";
import { getDefaultFieldSelection, FIELD_LABELS } from "../constants/syncableFields";

/**
 * Map SyncMetadataPage field keys to redacted_plex_syncs stored keys
 * These are the field names stored in the database when syncing Redacted → Plex
 */
const FIELD_KEY_TO_SYNC_KEY = {
  coverUrl: "artwork",
  title: "title",
  artist: "artist",
  year: "year",
  tags: "tags",
  label: "label",
};

/**
 * Check if a field has been synced from Redacted to Plex based on database record
 * @param {Object} redactedSyncedFields - Object from redacted_plex_syncs.synced_fields
 * @param {string} fieldKey - Field key from SyncMetadataPage (e.g., "tags")
 * @returns {boolean} True if the field was synced
 */
function isFieldSynced(redactedSyncedFields, fieldKey) {
  if (!redactedSyncedFields) return false;
  const syncKey = FIELD_KEY_TO_SYNC_KEY[fieldKey] || fieldKey;
  return redactedSyncedFields[syncKey] === true;
}

/**
 * Calculate diff between Plex and Redacted metadata
 * Only returns fields that are different
 * @param {Object} localAlbum - Plex album data
 * @param {Object} redactedData - Redacted remote data
 * @returns {Object} Object containing only changed fields
 *
 * NOTE: Currently unused - only syncing artwork for now.
 * Will be re-enabled when syncing other metadata fields.
 */
// eslint-disable-next-line no-unused-vars
function calculateMetadataDiff(localAlbum, redactedData) {
  const diff = {};

  // Match title
  if (redactedData.title && redactedData.title !== localAlbum.title) {
    diff.title = redactedData.title;
  }

  // Match year
  if (redactedData.year && redactedData.year !== localAlbum.year) {
    diff.year = redactedData.year;
  }

  // Include label if Redacted has it and it differs from Plex (Plex stores it as 'studio')
  if (redactedData.label && redactedData.label !== localAlbum.studio) {
    diff.label = redactedData.label;
  }

  // Always include tags/genre if Redacted has it (genre comparison is complex)
  if (redactedData.tags && Array.isArray(redactedData.tags) && redactedData.tags.length > 0) {
    diff.tags = redactedData.tags;
  }

  // Always include coverUrl if available
  if (redactedData.coverUrl) {
    diff.coverUrl = redactedData.coverUrl;
  }

  // Always include musicInfo credits if available (these are additional fields)
  if (redactedData.musicInfo) {
    diff.musicInfo = redactedData.musicInfo;
  }

  return diff;
}

function SyncMetadataPage() {
  const { id, groupId } = useParams();
  const navigate = useNavigate();
  const { data: localAlbum, isLoading: localLoading } = useAlbum(id);

  // Album navigation for prev/next
  const {
    prevAlbum,
    nextAlbum,
    currentIndex,
    totalMatched,
    isLoading: isNavLoading
  } = useAlbumNavigation(id);

  const [redactedData, setRedactedData] = useState(null);
  const [isLoadingMT, setIsLoadingMT] = useState(false);
  const [error, setError] = useState(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Artwork search modal state
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);

  // Selected artwork state (staged before sync)
  const [selectedArtwork, setSelectedArtwork] = useState(null);

  // Apply metadata state
  const [isApplying, setIsApplying] = useState(false);

  // Success/error message state
  const [applyMessage, setApplyMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // Field selection state (which fields to sync) - uses centralized config
  const [selectedFields, setSelectedFields] = useState(getDefaultFieldSelection);

  // Artwork dimensions state for resolution overlay
  const [localDimensions, setLocalDimensions] = useState(null);
  const [redactedDimensions, setRedactedDimensions] = useState(null);

  // Toggle field selection
  const toggleField = (fieldName) => {
    setSelectedFields(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName]
    }));
  };

  // Handle artwork selection from modal
  const handleArtworkSelect = (artworkData) => {
    setSelectedArtwork(artworkData);
    console.log('Artwork selected:', artworkData);
  };

  // Fetch Redacted data
  useEffect(() => {
    async function fetchRedactedData() {
      setIsLoadingMT(true);
      setError(null);

      try {
        const response = await fetch(`/api/metadata/redacted/${groupId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch Redacted data');
        }
        const result = await response.json();
        setRedactedData(result.data);
      } catch (err) {
        console.error('Error fetching Redacted data:', err);
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
      // Don't trigger if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' && prevAlbum) {
        navigate(`/albums/${prevAlbum.id}/sync/${prevAlbum.redactedId}`);
      } else if (e.key === 'ArrowRight' && nextAlbum) {
        navigate(`/albums/${nextAlbum.id}/sync/${nextAlbum.redactedId}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevAlbum, nextAlbum, navigate]);

  if (localLoading || isLoadingMT) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/60">Loading comparison...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-heading text-foreground mb-4">Error Loading Data</h2>
        <p className="text-foreground/60 mb-4">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  if (!localAlbum || !redactedData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-heading text-foreground mb-2">Data not found</h2>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
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
                onClick={() => prevAlbum && navigate(`/albums/${prevAlbum.id}/sync/${prevAlbum.redactedId}`)}
                isDisabled={!prevAlbum || isNavLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>

              <span className="text-sm text-foreground/60 min-w-[60px] text-center">
                {currentIndex !== null ? `${currentIndex + 1} / ${totalMatched}` : '...'}
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => nextAlbum && navigate(`/albums/${nextAlbum.id}/sync/${nextAlbum.redactedId}`)}
                isDisabled={!nextAlbum || isNavLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-heading text-foreground mb-2">
          Sync Metadata
        </h1>
        <p className="text-foreground/60">
          Apply the matched metadata to your local files and Plex library
        </p>

        {/* Status Indicators */}
        <div className="flex gap-3 mt-4">
          {/* Sync Status Badge - uses redactedSyncedFields for field-level tracking */}
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
                {allSynced
                  ? "✓ All fields synced"
                  : `${syncedCount}/${totalFields} fields synced`}
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

      {/* Album Artwork Comparison */}
      <div className="card-brutalist p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            checked={isFieldSynced(localAlbum.redactedSyncedFields, 'coverUrl') || selectedFields.coverUrl}
            onChange={() => !isFieldSynced(localAlbum.redactedSyncedFields, 'coverUrl') && toggleField('coverUrl')}
            disabled={isFieldSynced(localAlbum.redactedSyncedFields, 'coverUrl') || (!redactedData.coverUrl && !selectedArtwork)}
            className="w-4 h-4 accent-main disabled:opacity-50"
            title={isFieldSynced(localAlbum.redactedSyncedFields, 'coverUrl') ? "Already synced" : undefined}
          />
          <h3 className="text-sm font-heading text-foreground uppercase tracking-wide">
            Sync Album Artwork
          </h3>
        </div>
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
                  alt={localAlbum.title || 'Album artwork'}
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
                  href={getMetadataServiceUrl('redacted', groupId)}
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
                  alt={redactedData.title || 'Album artwork'}
                  className="w-full h-full object-cover rounded-base border-2 border-main shadow-main"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setRedactedDimensions({ width: img.naturalWidth, height: img.naturalHeight });
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
                      setLightboxIndex(1);
                      setLightboxOpen(true);
                    }}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>
                <ResolutionBadge width={redactedDimensions?.width} height={redactedDimensions?.height} />
              </div>
            ) : (
              <div className="w-[200px] h-[200px] bg-background-secondary rounded-base border-2 border-main shadow-main flex items-center justify-center">
                <Music className="w-16 h-16 text-foreground/30" />
              </div>
            )}
          </div>

          {/* Selected Artwork Preview (if user has selected custom artwork) */}
          {selectedArtwork && (
            <div className="flex flex-col items-center">
              <h3 className="text-sm font-heading text-foreground mb-3">Selected for Sync</h3>
              <div
                className="relative group w-[200px] h-[200px] cursor-pointer"
                onClick={() => {
                  setLightboxIndex(2);
                  setLightboxOpen(true);
                }}
              >
                <img
                  src={selectedArtwork.type === 'upload' ? selectedArtwork.preview : selectedArtwork.url}
                  alt="Selected artwork"
                  className="w-full h-full object-cover rounded-base border-2 border-green-500 shadow-[4px_4px_0_0_rgb(34,197,94)]"
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
                    aria-label="View artwork fullscreen"
                    title="View artwork fullscreen"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(2);
                      setLightboxOpen(true);
                    }}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button
                    className={cn(
                      "p-1.5 rounded-base",
                      "bg-black/60 text-white backdrop-blur-sm",
                      "opacity-0 group-hover:opacity-100 transition-all duration-200",
                      "hover:bg-red-500/80 hover:scale-110",
                      "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2",
                      "w-7 h-7 flex items-center justify-center"
                    )}
                    aria-label="Remove selected artwork"
                    title="Remove selected artwork"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedArtwork(null);
                    }}
                  >
                    <span className="text-xs">✕</span>
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 right-2 bg-green-500/90 text-white text-xs font-heading px-2 py-1 rounded-base text-center">
                  {selectedArtwork.type === 'upload' ? 'Custom Upload' : 'From URL'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Comparison Table */}
      <div className="card-brutalist p-6 mb-6">
        <div className="grid grid-cols-[auto_auto_1fr_1fr] gap-4">
          {/* Super Header Row - Checkbox + Label + Local vs Remote */}
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
          <MetadataRow
            label="Album"
            leftValue={localAlbum.title}
            rightValue={redactedData.title}
            fieldName="title"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(localAlbum.redactedSyncedFields, 'title')}
          />

          {/* Year Row */}
          <MetadataRow
            label="Year"
            leftValue={localAlbum.year}
            rightValue={redactedData.year}
            fieldName="year"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(localAlbum.redactedSyncedFields, 'year')}
          />

          {/* Genre Row - read-only info display */}
          <InfoTagRow label="Genre" values={localAlbum.genres} />

          {/* Style Row - syncable: Plex styles (left) vs Redacted tags (right) */}
          <GenreStylesRow
            label="Style"
            leftValues={localAlbum.styles || []}
            rightValues={formatRedactedTags(redactedData.tags)}
            fieldName="tags"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(localAlbum.redactedSyncedFields, 'tags')}
          />

          {/* Track Count Row - no checkbox */}
          <MetadataRow
            label="Track Count"
            leftValue={localAlbum.trackCount ? `${localAlbum.trackCount} tracks` : null}
            rightValue={redactedData.trackCount ? `${redactedData.trackCount} tracks` : null}
          />

          {/* Label Row - show if either Plex (studio) or Redacted has it */}
          {(redactedData.label || localAlbum.studio) && (
            <MetadataRow
              label="Label"
              leftValue={localAlbum.studio}
              rightValue={redactedData.label}
              fieldName="label"
              selectedFields={selectedFields}
              toggleField={toggleField}
              isSynced={isFieldSynced(localAlbum.redactedSyncedFields, 'label')}
            />
          )}

        </div>
      </div>

      {/* Track Titles Comparison Card */}
      <TrackComparisonCard
        localTracks={localAlbum.tracks}
        remoteTracks={redactedData.trackList}
      />

      {/* Success/Error Message */}
      {applyMessage && (
        <div className={`card-brutalist p-4 mb-6 ${applyMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'}`}>
          <p className={`text-sm font-heading ${applyMessage.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
            {applyMessage.type === 'success' ? '✅ ' : '❌ '}{applyMessage.text}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center mt-6">
        <Button variant="secondary" size="md" asChild>
          <Link to={`/albums/${id}/metadata-search`}>
            Cancel
          </Link>
        </Button>
        <Button
          variant="primary"
          size="md"
          isLoading={isApplying}
          onClick={async () => {
            setIsApplying(true);
            setApplyMessage(null);

            console.log('Syncing album metadata:', { groupId, service: 'redacted', selectedFields });

            try {
              // Build metadata diff object based on selected fields
              const diff = {};

              // Artwork (special case - handle separately)
              if (selectedFields.coverUrl) {
                if (selectedArtwork) {
                  // Use user-selected artwork
                  if (selectedArtwork.type === 'upload') {
                    diff.coverUrl = selectedArtwork.preview;
                  } else {
                    diff.coverUrl = selectedArtwork.url;
                  }
                  console.log('Using selected artwork:', diff.coverUrl.substring(0, 100));
                } else if (redactedData.coverUrl) {
                  // Use Redacted's artwork if no custom selection
                  diff.coverUrl = redactedData.coverUrl;
                }
              }

              // All other metadata fields - loop instead of individual if-statements
              ['title', 'year', 'tags', 'label'].forEach(field => {
                if (selectedFields[field] && redactedData[field]) {
                  // Handle array fields (tags)
                  if (Array.isArray(redactedData[field]) && redactedData[field].length > 0) {
                    diff[field] = redactedData[field];
                  }
                  // Handle scalar fields (title, year, label)
                  else if (!Array.isArray(redactedData[field])) {
                    diff[field] = redactedData[field];
                  }
                }
              });

              console.log('Metadata diff to sync:', diff);

              const response = await fetch(`/api/albums/${id}/metadata/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  service: 'redacted',
                  groupId,
                  applyToFileTags: false, // ONLY update Plex, not file tags
                  applyToPlex: true,
                  metadata: diff
                })
              });

              const result = await response.json();
              console.log('Sync result:', result);

              if (response.ok && result.success) {
                // Success! Build dynamic message based on what was synced
                const syncedFields = Object.keys(diff);
                const syncedFieldNames = syncedFields.map(f => FIELD_LABELS[f] || f).join(', ');

                setApplyMessage({
                  type: 'success',
                  text: `Synced successfully: ${syncedFieldNames}. Plex library has been updated.`
                });

                // Redirect to synced tab after 2 seconds
                setTimeout(() => {
                  window.location.href = `/?filter=synced`;
                }, 2000);
              } else {
                // Failure
                const errorText = result.message || result.error || 'Failed to sync metadata';
                setApplyMessage({
                  type: 'error',
                  text: errorText
                });
              }
            } catch (error) {
              console.error('Sync metadata error:', error);
              setApplyMessage({
                type: 'error',
                text: `Network error: ${error.message}`
              });
            } finally {
              setIsApplying(false);
            }
          }}
        >
          Sync Metadata
        </Button>
      </div>

      {/* Lightbox for fullscreen artwork comparison */}
      {lightboxOpen && (
        <Lightbox
          items={[
            // Local album artwork
            ...(localAlbum.hasArtwork
              ? [{ source: "local", url: `/api/albums/${id}/artwork` }]
              : []),
            // Redacted artwork
            ...(redactedData.coverUrl
              ? [{ source: "redacted", url: redactedData.coverUrl }]
              : []),
            // Selected artwork (if any)
            ...(selectedArtwork
              ? [{
                  source: selectedArtwork.type === 'upload' ? 'custom upload' : 'selected',
                  url: selectedArtwork.type === 'upload' ? selectedArtwork.preview : selectedArtwork.url
                }]
              : []),
          ]}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Artwork Search Modal */}
      <ArtworkSearchModal
        isOpen={artworkModalOpen}
        onClose={() => setArtworkModalOpen(false)}
        albumId={id}
        onSelectArtwork={handleArtworkSelect}
      />
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
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&ntilde;': 'ñ',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Oacute;': 'Ó',
    '&Uacute;': 'Ú',
    '&Ntilde;': 'Ñ',
    '&uuml;': 'ü',
    '&Uuml;': 'Ü',
    '&ouml;': 'ö',
    '&Ouml;': 'Ö',
    '&auml;': 'ä',
    '&Auml;': 'Ä',
    '&ccedil;': 'ç',
    '&Ccedil;': 'Ç'
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char);
  }

  // Handle numeric entities like &#225; (á)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

  // Handle hex entities like &#xE1; (á)
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
}

/**
 * TrackComparisonCard - Displays side-by-side track title comparison
 * @param {Array} localTracks - Array of Plex track objects with { title, trackNumber }
 * @param {Array} remoteTracks - Array of Redacted track filenames
 */
function TrackComparisonCard({ localTracks = [], remoteTracks = [] }) {
  // Parse remote track filenames - keep full filename with track numbers
  const parseRemoteTrackTitle = (filename) => {
    if (!filename) return null;

    // Remove file extension
    const withoutExt = filename.replace(/\.(flac|mp3|wav|m4a|ogg|opus|aac|alac|ape|wv)$/i, '');

    // Decode HTML entities (e.g., &oacute; -> ó)
    const decoded = decodeHtmlEntities(withoutExt);

    // Return full filename (including track number and any artist prefixes)
    return decoded;
  };

  // Prepare track data for comparison
  const maxTrackCount = Math.max(localTracks.length, remoteTracks.length);

  // Build array of track comparison objects
  const trackComparisons = [];
  for (let i = 0; i < maxTrackCount; i++) {
    const localTrack = localTracks[i];
    const remoteTrack = remoteTracks[i];

    trackComparisons.push({
      trackNumber: i + 1,
      localTitle: localTrack?.title || null,
      remoteTitle: parseRemoteTrackTitle(remoteTrack) || null
    });
  }

  return (
    <div className="card-brutalist p-6 mb-6">
      <h2 className="text-lg font-heading text-foreground mb-4">
        Track Titles Comparison
      </h2>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-4">
        {/* Header Row */}
        <div className="font-heading text-foreground text-sm py-2">#</div>
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2">
          Local Track Titles (Plex)
        </div>
        <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2">
          Remote Filenames (Redacted)
        </div>

        {/* Track Rows */}
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

/**
 * TrackComparisonRow - Displays a single track comparison row
 * Note: No diffing/highlighting applied since local track titles and remote filenames
 * are inherently different formats and not directly comparable
 */
function TrackComparisonRow({ trackNumber, localTitle, remoteTitle }) {
  return (
    <>
      <div className="font-heading text-foreground text-xs py-2 text-center">
        {trackNumber}
      </div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {localTitle || '-'}
      </div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {remoteTitle || '-'}
      </div>
    </>
  );
}

export default SyncMetadataPage;
