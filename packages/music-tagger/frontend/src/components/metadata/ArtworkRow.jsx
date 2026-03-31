import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * Artwork comparison row for the sync detail grid.
 * Shows side-by-side thumbnail images with dimensions for local (embedded) vs Plex artwork.
 * Spans all 4 grid columns as a full-width card.
 *
 * @param {Object} props
 * @param {boolean} props.plexHasArtwork - Whether the Plex album has artwork
 * @param {string} props.artworkUrl - URL to fetch Plex artwork image
 * @param {boolean} props.fileHasArtwork - Whether files have embedded artwork
 * @param {string} props.albumId - Album ID for constructing embedded artwork URL
 * @param {string} props.fieldName - Field key for checkbox state
 * @param {Object} props.selectedFields - Object mapping fieldNames to boolean selected state
 * @param {Function} props.toggleField - Callback to toggle field selection
 * @param {boolean} props.isSynced - Whether this field was already synced
 */
export function ArtworkRow({
  plexHasArtwork,
  artworkUrl,
  fileHasArtwork,
  albumId,
  fieldName = "artwork",
  selectedFields,
  toggleField,
  isSynced = false,
}) {
  const showCheckbox = plexHasArtwork;
  const [localDims, setLocalDims] = useState(null);
  const [plexDims, setPlexDims] = useState(null);

  const embeddedArtworkUrl = albumId
    ? `/api/albums/${albumId}/artwork/embedded`
    : null;

  const handleImageLoad = (e, setDims) => {
    setDims({
      width: e.target.naturalWidth,
      height: e.target.naturalHeight,
    });
  };

  return (
    <div className="col-span-4 mt-2 mb-2">
      {/* Header with checkbox */}
      <div className="flex items-center gap-3 mb-3">
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={isSynced || (selectedFields?.[fieldName] || false)}
            onChange={() => !isSynced && toggleField?.(fieldName)}
            disabled={isSynced}
            className="w-4 h-4 accent-main disabled:opacity-50"
            title={isSynced ? "Already synced" : undefined}
          />
        ) : (
          <div className="w-4 h-4" />
        )}
        <span className="font-heading text-foreground text-sm uppercase tracking-wide">
          Sync Album Artwork
        </span>
      </div>

      {/* Side-by-side thumbnails */}
      <div className="grid grid-cols-2 gap-6 ml-7">
        {/* Local embedded artwork */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-heading text-foreground/60 uppercase tracking-wide">
            Your Local Album
          </span>
          {fileHasArtwork && embeddedArtworkUrl ? (
            <>
              <img
                src={embeddedArtworkUrl}
                alt="Local embedded artwork"
                className="w-48 h-48 object-cover rounded-base border-2 border-border"
                onLoad={(e) => handleImageLoad(e, setLocalDims)}
              />
              {localDims && (
                <span className="text-xs text-foreground/50">
                  {localDims.width}×{localDims.height}
                </span>
              )}
            </>
          ) : (
            <div className="w-48 h-48 bg-background-secondary rounded-base border-2 border-border flex items-center justify-center">
              <div className="flex flex-col items-center gap-1 text-foreground/30">
                <ImageOff className="w-8 h-8" />
                <span className="text-xs">No artwork</span>
              </div>
            </div>
          )}
        </div>

        {/* Plex artwork */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-heading text-foreground/60 uppercase tracking-wide">
            Plex
          </span>
          {plexHasArtwork ? (
            <>
              <img
                src={artworkUrl}
                alt="Plex artwork"
                className="w-48 h-48 object-cover rounded-base border-2 border-main"
                onLoad={(e) => handleImageLoad(e, setPlexDims)}
              />
              {plexDims && (
                <span className="text-xs text-foreground/50">
                  {plexDims.width}×{plexDims.height}
                </span>
              )}
            </>
          ) : (
            <div className="w-48 h-48 bg-background-secondary rounded-base border-2 border-border flex items-center justify-center">
              <div className="flex flex-col items-center gap-1 text-foreground/30">
                <ImageOff className="w-8 h-8" />
                <span className="text-xs">No artwork</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
