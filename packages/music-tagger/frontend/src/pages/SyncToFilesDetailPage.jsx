import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAlbum } from "../hooks/useAlbum";
import { useFileMetadata } from "../hooks/useFileMetadata";
import { useFileSyncNavigation } from "../hooks/useFileSyncNavigation";
import { syncAlbumToFiles } from "../api/syncToFiles";
import { Button, cn, MetadataRow, GenreStylesRow } from "@dj-tools/my-component-library";
import { InfoTagRow, ArtworkRow } from "../components/metadata";
import { ArrowLeft, ChevronLeft, ChevronRight, Music } from "lucide-react";
import {
  PLEX_TO_FILE_SYNCABLE_FIELDS,
  getDefaultPlexToFileFieldSelection,
  PLEX_TO_FILE_FIELD_LABELS,
} from "../constants/plexToFileSyncableFields";

/**
 * Map SyncToFilesDetailPage field keys to plex_file_syncs stored keys
 * The two systems use slightly different naming conventions
 */
const FIELD_KEY_TO_SYNC_KEY = {
  genre: "genre",
  title: "title",
  artist: "artist",
  year: "year",
  studio: "studio",
  artwork: "artwork",
};

/**
 * Check if a field has been synced based on database record
 * @param {Object} syncedFields - Object from plex_file_syncs.synced_fields
 * @param {string} fieldKey - Field key (e.g., "genre")
 * @returns {boolean} True if the field was synced
 */
function isFieldSynced(syncedFields, fieldKey) {
  if (!syncedFields) return false;
  const syncKey = FIELD_KEY_TO_SYNC_KEY[fieldKey] || fieldKey;
  return syncedFields[syncKey] === true;
}

/**
 * Detail page for syncing Plex metadata to local file tags
 * Shows side-by-side comparison: Files (local/target) vs Plex Metadata (remote/source)
 */
function SyncToFilesDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch Plex album data (source)
  const { data: album, isLoading: albumLoading } = useAlbum(id);

  // Fetch current file metadata (target)
  const { data: fileMetadata, isLoading: fileLoading } = useFileMetadata(id);

  // Album navigation for prev/next
  const {
    prevAlbum,
    nextAlbum,
    currentIndex,
    totalAlbums,
    isLoading: isNavLoading,
  } = useFileSyncNavigation(id);

  // Field selection state - uses centralized config
  const [selectedFields, setSelectedFields] = useState(
    getDefaultPlexToFileFieldSelection
  );

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Toggle field selection
  const toggleField = (fieldName) => {
    setSelectedFields((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  // Keyboard navigation with arrow keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      if (e.key === "ArrowLeft" && prevAlbum) {
        navigate(`/sync-to-files/${prevAlbum.id}`);
      } else if (e.key === "ArrowRight" && nextAlbum) {
        navigate(`/sync-to-files/${nextAlbum.id}`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevAlbum, nextAlbum, navigate]);

  // Handle sync
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = await syncAlbumToFiles(id, selectedFields);

      // Corruption detection takes priority — never silently succeed.
      if (result.corruptedFiles && result.corruptedFiles.length > 0) {
        setSyncMessage({
          type: "corruption",
          text: `CORRUPTION DETECTED — audio stream changed in ${result.corruptedFiles.length} file(s). Sync aborted.`,
          corruptedFiles: result.corruptedFiles,
        });
      } else if (result.success) {
        const syncedFieldNames = Object.entries(selectedFields)
          .filter(([, selected]) => selected)
          .map(([key]) => PLEX_TO_FILE_FIELD_LABELS[key] || key)
          .join(", ");

        setSyncMessage({
          type: "success",
          text: `Synced successfully: ${syncedFieldNames}. ${result.filesUpdated || 0} files updated.`,
        });

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["fileMetadata", id] });
        queryClient.invalidateQueries({ queryKey: ["albums"] });
        queryClient.invalidateQueries({ queryKey: ["album", id] });

        // Navigate back after delay
        setTimeout(() => {
          navigate("/sync-to-files");
        }, 2000);
      } else {
        setSyncMessage({
          type: "error",
          text: result.error || "Sync failed",
        });
      }
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error.message || "Network error during sync",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Loading state
  if (albumLoading || fileLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/60">Loading comparison...</div>
      </div>
    );
  }

  // Error state
  if (!album) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-heading text-foreground mb-4">
          Album not found
        </h2>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  // Prepare Plex metadata (source - right column)
  // Keep genre and style separate for display
  const plexGenreRaw = album.genres || [];
  const plexStyleRaw = album.styles || [];

  // Merged and case-insensitive deduplicated for sync (Plex genres+styles)
  const seenTags = new Set();
  const plexTags = [...plexGenreRaw, ...plexStyleRaw].filter((tag) => {
    const key = tag.toLowerCase();
    if (seenTags.has(key)) return false;
    seenTags.add(key);
    return true;
  });

  // Parse file genres (comes as semicolon-separated string from file tags)
  const fileGenres = fileMetadata?.genre
    ? fileMetadata.genre
        .split(/[;,]/)
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  // Get sync status from album (database-tracked)
  const syncedFields = album.syncedFields;

  // Count synced fields for status badge
  const getSyncStatus = () => {
    if (!syncedFields) {
      return { synced: 0, total: 0, allSynced: false };
    }
    const fieldKeys = Object.keys(syncedFields);
    const syncedCount = fieldKeys.filter((k) => syncedFields[k] === true).length;
    const totalFields = fieldKeys.length;
    return {
      synced: syncedCount,
      total: totalFields,
      allSynced: totalFields > 0 && syncedCount === totalFields,
    };
  };

  const syncStatus = getSyncStatus();

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
          {totalAlbums > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  prevAlbum && navigate(`/sync-to-files/${prevAlbum.id}`)
                }
                isDisabled={!prevAlbum || isNavLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>

              <span className="text-sm text-foreground/60 min-w-[60px] text-center">
                {currentIndex !== null
                  ? `${currentIndex + 1} / ${totalAlbums}`
                  : "..."}
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  nextAlbum && navigate(`/sync-to-files/${nextAlbum.id}`)
                }
                isDisabled={!nextAlbum || isNavLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-heading text-foreground mb-2">
          Sync to Files
        </h1>
        <p className="text-foreground/60">
          Write Plex metadata to local file tags (ID3/Vorbis)
        </p>

        {/* Album Info */}
        <div className="mt-4 flex items-center gap-4">
          {album.hasArtwork ? (
            <img
              src={`/api/albums/${id}/artwork`}
              alt={album.title}
              className="w-16 h-16 object-cover rounded-base border-2 border-border"
            />
          ) : (
            <div className="w-16 h-16 bg-background-secondary rounded-base border-2 border-border flex items-center justify-center">
              <Music className="w-8 h-8 text-foreground/30" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-heading text-foreground">
              {album.title}
            </h2>
            <p className="text-foreground/60">{album.artist}</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex gap-3 mt-4">
          {/* Sync Status Badge - uses database record */}
          {(() => {
            if (!syncedFields) {
              return (
                <div className="px-3 py-1.5 rounded-base border-2 text-sm font-heading bg-gray-100 border-gray-400 text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400">
                  Not yet synced
                </div>
              );
            }

            return (
              <div
                className={cn(
                  "px-3 py-1.5 rounded-base border-2 text-sm font-heading",
                  syncStatus.allSynced
                    ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                )}
              >
                {syncStatus.allSynced
                  ? "✓ All fields synced"
                  : `${syncStatus.synced}/${syncStatus.total} fields synced`}
              </div>
            );
          })()}
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
            File Tags
          </div>
          <div className="font-heading text-foreground text-xs text-center border-b border-main pb-2">
            Plex Metadata
          </div>

          {/* Album Title Row */}
          <MetadataRow
            label="Album"
            leftValue={fileMetadata?.title}
            rightValue={album.title}
            fieldName="title"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "title")}
            disabled={
              !PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === "title")
                ?.implemented
            }
          />

          {/* Artist Row */}
          <MetadataRow
            label="Artist"
            leftValue={fileMetadata?.artist}
            rightValue={album.artist}
            fieldName="artist"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "artist")}
            disabled={
              !PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === "artist")
                ?.implemented
            }
          />

          {/* Year Row */}
          <MetadataRow
            label="Year"
            leftValue={fileMetadata?.year}
            rightValue={album.year}
            fieldName="year"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "year")}
            disabled={
              !PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === "year")
                ?.implemented
            }
          />

          {/* Genre Row - read-only info display (Plex genres) */}
          <InfoTagRow label="Genre" values={plexGenreRaw} />

          {/* Style Row - read-only info display (Plex styles) */}
          <InfoTagRow label="Style" values={plexStyleRaw} />

          {/* Tags Row - syncable: File genres (left) vs Plex genres+styles merged (right) */}
          <GenreStylesRow
            label="Tags"
            leftValues={fileGenres}
            rightValues={plexTags}
            fieldName="genre"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "genre")}
            disabled={
              !PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === "genre")
                ?.implemented
            }
          />

          {/* Label/Studio Row */}
          <MetadataRow
            label="Label"
            leftValue={fileMetadata?.label}
            rightValue={album.studio}
            fieldName="studio"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "studio")}
            disabled={
              !PLEX_TO_FILE_SYNCABLE_FIELDS.find((f) => f.key === "studio")
                ?.implemented
            }
          />

          {/* Artwork Row */}
          <ArtworkRow
            plexHasArtwork={album.hasArtwork}
            artworkUrl={`/api/albums/${id}/artwork`}
            fileHasArtwork={fileMetadata?.tracks?.some((t) => t.hasArtwork) || false}
            albumId={id}
            fieldName="artwork"
            selectedFields={selectedFields}
            toggleField={toggleField}
            isSynced={isFieldSynced(syncedFields, "artwork")}
          />
        </div>

        {/* Note about disabled fields */}
        <div className="mt-4 text-xs text-foreground/50">
          Note: Fields without checkboxes are not yet implemented for file
          syncing.
        </div>
      </div>

      {/* Success/Error Message */}
      {syncMessage && syncMessage.type === "corruption" && (
        <div className="card-brutalist p-4 mb-6 bg-red-100 dark:bg-red-900/40 border-red-700 border-4">
          <p className="text-base font-heading text-red-900 dark:text-red-100 mb-2">
            🚨 {syncMessage.text}
          </p>
          {syncMessage.corruptedFiles && syncMessage.corruptedFiles.length > 0 && (
            <ul className="text-sm font-mono text-red-900 dark:text-red-100 list-disc list-inside">
              {syncMessage.corruptedFiles.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-red-900 dark:text-red-100">
            The audio stream of the above file(s) changed during the write. Do not
            re-run sync on this album until you've inspected the file(s) manually.
          </p>
        </div>
      )}
      {syncMessage && syncMessage.type !== "corruption" && (
        <div
          className={cn(
            "card-brutalist p-4 mb-6",
            syncMessage.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-500"
              : "bg-red-50 dark:bg-red-900/20 border-red-500"
          )}
        >
          <p
            className={cn(
              "text-sm font-heading",
              syncMessage.type === "success"
                ? "text-green-800 dark:text-green-200"
                : "text-red-800 dark:text-red-200"
            )}
          >
            {syncMessage.type === "success" ? "✅ " : "❌ "}
            {syncMessage.text}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center mt-6">
        <Button variant="secondary" size="md" asChild>
          <Link to="/sync-to-files">Cancel</Link>
        </Button>
        <Button
          variant="primary"
          size="md"
          isLoading={isSyncing}
          onClick={handleSync}
          isDisabled={
            !Object.values(selectedFields).some(Boolean) || isSyncing
          }
        >
          Sync to Files
        </Button>
      </div>
    </div>
  );
}

export default SyncToFilesDetailPage;
