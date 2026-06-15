import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { useMatchAlbum } from "../hooks/useMatchAlbum";
import { Button, cn, EmptyState, TagPill } from "@music-tools/my-component-library";
import Lightbox from "../components/Lightbox";
import { ArrowLeft, Music, ZoomIn } from "lucide-react";
import { formatRedactedTags } from "../utils/formatters";

/**
 * Calculate diff between Plex and Redacted metadata
 * Only returns fields that are different
 * @param {Object} localAlbum - Plex album data
 * @param {Object} redactedData - Redacted remote data
 * @returns {Object} Object containing only changed fields
 */
// eslint-disable-next-line no-unused-vars
function calculateMetadataDiff(localAlbum, redactedData) {
  const diff = {};

  // Match title
  if (redactedData.title && redactedData.title !== localAlbum.title) {
    diff.title = redactedData.title;
  }

  // Match artist
  if (redactedData.artist && redactedData.artist !== localAlbum.artist) {
    diff.artist = redactedData.artist;
  }

  // Match year
  if (redactedData.year && redactedData.year !== localAlbum.year) {
    diff.year = redactedData.year;
  }

  // Always include label if Redacted has it (Plex doesn't store label)
  if (redactedData.label) {
    diff.label = redactedData.label;
  }

  // Always include catalog number if Redacted has it
  if (redactedData.catalogNumber) {
    diff.catalogNumber = redactedData.catalogNumber;
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

function MatchMetadataPage() {
  const { id, groupId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: localAlbum, isLoading: localLoading } = useAlbum(id);

  const [redactedData, setRedactedData] = useState(null);
  const [isLoadingMT, setIsLoadingMT] = useState(false);
  const [error, setError] = useState(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Success/error message state
  const [applyMessage, setApplyMessage] = useState(null); // { type: 'success' | 'error', text: string }

  const matchAlbum = useMatchAlbum(id);
  const isApplying = matchAlbum.isPending;

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

  if (localLoading || isLoadingMT) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/60">Loading comparison...</div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        heading="Error Loading Data"
        description={error}
        action={
          <Button variant="secondary" size="sm" asChild>
            <Link to={`/albums/${id}/metadata-search`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Link>
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
          <Button variant="secondary" size="sm" asChild>
            <Link to={`/albums/${id}/metadata-search`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Link>
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
          <Button variant="secondary" size="sm" asChild>
            <Link to={`/albums/${id}/metadata-search`}>
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Link>
          </Button>
        </div>

        <h1 className="text-2xl font-heading text-foreground mb-2">
          Match Metadata
        </h1>
        <p className="text-foreground/60">
          Review the differences between your local data and the remote match
        </p>
      </div>

      {/* Album Artwork Comparison */}
      <div className="card-brutalist p-6 mb-6">
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
              </div>
            ) : (
              <div className="w-[200px] h-[200px] bg-background-secondary rounded-base border-2 border-border shadow-base flex items-center justify-center">
                <Music className="w-16 h-16 text-foreground/30" />
              </div>
            )}
          </div>

          {/* Redacted Artwork */}
          <div className="flex flex-col items-center">
            <h3 className="text-sm font-heading text-foreground mb-3">Redacted Match</h3>
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
                      setLightboxIndex(1);
                      setLightboxOpen(true);
                    }}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-[200px] h-[200px] bg-background-secondary rounded-base border-2 border-main shadow-main flex items-center justify-center">
                <Music className="w-16 h-16 text-foreground/30" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata Comparison Table */}
      <div className="card-brutalist p-6 mb-6">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-4">
          {/* Super Header Row - Local vs Remote */}
          <div className="font-heading text-foreground text-sm"></div>
          <div className="font-heading text-foreground text-sm text-center border-b-2 border-border pb-2 mb-2 bg-background-secondary/50">
            Local
          </div>
          <div className="font-heading text-foreground text-sm text-center border-b-2 border-main pb-2 mb-2 bg-main/5">
            Remote
          </div>

          {/* Sub Header Row */}
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
            plexValue={localAlbum.title}
            matchValue={redactedData.title}
          />

          {/* Artist Row */}
          <MetadataRow
            label="Artist"
            plexValue={localAlbum.artist}
            matchValue={redactedData.artist}
          />

          {/* Year Row */}
          <MetadataRow
            label="Year"
            plexValue={localAlbum.year}
            matchValue={redactedData.year}
          />

          {/* Styles Row - Match Plex styles vs Redacted tags */}
          <MetadataRow
            label="Styles"
            plexValue={localAlbum.styles}
            matchValue={formatRedactedTags(redactedData.tags)}
          />

          {/* Label Row */}
          <MetadataRow
            label="Label"
            plexValue={localAlbum.studio}
            matchValue={redactedData.label}
          />
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
            setApplyMessage(null);
            try {
              const result = await matchAlbum.mutateAsync({
                service: "redacted",
                groupId,
              });

              if (result?.success) {
                setApplyMessage({
                  type: "success",
                  text: "Album matched successfully! You can sync it later to apply metadata.",
                });

                // Albums cache was already invalidated in the mutation's
                // onSuccess — the Matched tab will pick up the new row
                // on mount without a manual refresh.
                setTimeout(() => {
                  const library = searchParams.get("library");
                  const params = new URLSearchParams({ filter: "matched" });
                  if (library) params.set("library", library);
                  navigate(`/?${params.toString()}`);
                }, 2000);
              } else {
                setApplyMessage({
                  type: "error",
                  text: result?.message || result?.error || "Failed to match album",
                });
              }
            } catch (error) {
              console.error("Match album error:", error);
              setApplyMessage({
                type: "error",
                text: `Network error: ${error.message}`,
              });
            }
          }}
        >
          Match Album
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
          ]}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

    </div>
  );
}

// Helper component for displaying metadata rows in 3-column grid (label + 2 value columns)
// Automatically detects differences between plexValue and matchValue
function MetadataRow({ label, plexValue, matchValue }) {
  // Normalize values for comparison
  // Treat null, undefined, empty string, empty array, and '-' as equivalent "no value"
  const normalize = (val) => {
    if (val === null || val === undefined || val === '' || val === '-') return null;
    if (Array.isArray(val)) {
      if (val.length === 0) return null;
      return [...val]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }))
        .join(',');
    }
    return String(val).trim();
  };

  const normalizedPlex = normalize(plexValue);
  const normalizedMatch = normalize(matchValue);

  // Auto-detect if values differ
  const isDifferent = normalizedMatch !== null && normalizedPlex !== normalizedMatch;

  const renderValue = (val) => {
    if (Array.isArray(val)) {
      if (val.length === 0) return '-';
      const sorted = [...val].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
      );
      return (
        <div className="flex flex-wrap gap-1">
          {sorted.map((tag, i) => (
            <TagPill key={i} label={tag} isNew={false} />
          ))}
        </div>
      );
    }
    return val || '-';
  };

  return (
    <>
      <div className="font-heading text-foreground text-sm py-2">{label}</div>
      <div className="text-foreground text-sm py-2 px-3 rounded-base border border-border">
        {renderValue(plexValue)}
      </div>
      <div className={`text-foreground text-sm py-2 px-3 rounded-base border-2 ${
        isDifferent ? 'border-main bg-main/5' : 'border-border'
      }`}>
        {renderValue(matchValue)}
      </div>
    </>
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

export default MatchMetadataPage;
