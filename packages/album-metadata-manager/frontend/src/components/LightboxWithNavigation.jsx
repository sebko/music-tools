import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import { useLightboxNavigation } from "../hooks/useLightboxNavigation";

/**
 * Lightbox with cross-pagination navigation.
 * Allows cycling through ALL album artwork across pagination boundaries.
 */
export default function LightboxWithNavigation({
  initialGlobalIndex,
  pageSize,
  sortBy,
  sortOrder,
  filter,
  search,
  totalAlbums,
  onClose,
  onNavigate,
  artworkQuality = "",
  syncCompleteness = "",
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState("fit"); // 'fit' | '1:1'
  const [showUI, setShowUI] = useState(true);
  const [dims, setDims] = useState({ width: null, height: null });
  const hideTimerRef = useRef(null);

  const {
    currentAlbum,
    globalIndex,
    goNext,
    goPrev,
    hasNext,
    hasPrev,
    isLoading,
    totalAlbums: total,
  } = useLightboxNavigation({
    initialGlobalIndex,
    pageSize,
    sortBy,
    sortOrder,
    filter,
    search,
    totalAlbums,
    artworkQuality,
    syncCompleteness,
  });

  // Notify parent of navigation changes
  useEffect(() => {
    onNavigate?.(globalIndex);
  }, [globalIndex, onNavigate]);

  // Attempt fullscreen when mounted
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) return;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Key handlers
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      setShowUI(true);
      scheduleHide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, goPrev, onClose]);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    setShowUI(true);
    scheduleHide();
    return () => clearTimeout(hideTimerRef.current);
  }, [globalIndex, scheduleHide]);

  const onMouseMove = () => {
    if (!showUI) setShowUI(true);
    scheduleHide();
  };

  // Reset dims on album change
  useEffect(() => {
    setDims({ width: null, height: null });
  }, [currentAlbum?.id]);

  // Preload neighboring images
  useEffect(() => {
    if (!currentAlbum?.artworkFullUrl) return;
    // The hook already prefetches page data, but we can preload the actual images
    // This is handled by the browser when we render, so no extra code needed
  }, [currentAlbum]);

  // Get artwork URL
  const artworkUrl = currentAlbum?.artworkFullUrl;
  const albumTitle = currentAlbum?.title || "Unknown Album";
  const albumArtist = currentAlbum?.artist || "Unknown Artist";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 text-white"
      onMouseMove={onMouseMove}
      role="dialog"
      aria-modal="true"
    >
      {/* Image area */}
      <div className="absolute inset-0 overflow-auto flex items-center justify-center select-none">
        {isLoading || !artworkUrl ? (
          <div className="flex flex-col items-center gap-4 text-white/60">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading artwork...</span>
          </div>
        ) : (
          <img
            src={artworkUrl}
            alt={`${albumArtist} - ${albumTitle}`}
            onLoad={(e) => {
              const img = e.currentTarget;
              setDims({ width: img.naturalWidth, height: img.naturalHeight });
            }}
            onDoubleClick={() => setZoom((z) => (z === "fit" ? "1:1" : "fit"))}
            className={
              zoom === "fit" ? "max-w-full max-h-full object-contain" : ""
            }
          />
        )}
      </div>

      {/* Top bar */}
      {showUI && (
        <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <div className="text-sm opacity-90 truncate max-w-[50%]">
            {albumArtist} - {albumTitle}
          </div>
          <div className="flex items-center gap-2">
            {artworkUrl && (
              <a
                href={artworkUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Open original
              </a>
            )}
            <button
              onClick={() => onClose?.()}
              className="text-sm px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      {showUI && (
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent text-xs">
          <div className="flex items-center gap-4">
            {/* Position indicator */}
            <div className="opacity-90 font-medium">
              {globalIndex + 1} of {total.toLocaleString()}
            </div>
            {/* Dimensions */}
            <div className="opacity-70">
              {dims.width && dims.height
                ? `${dims.width}×${dims.height}`
                : isLoading
                  ? ""
                  : "Loading..."}
            </div>
          </div>
          <button
            onClick={() => setZoom((z) => (z === "fit" ? "1:1" : "fit"))}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
            disabled={!artworkUrl}
          >
            {zoom === "fit" ? (
              <>
                <ZoomIn className="w-3 h-3" />
                Zoom 100%
              </>
            ) : (
              <>
                <ZoomOut className="w-3 h-3" />
                Fit to screen
              </>
            )}
          </button>
        </div>
      )}

      {/* Nav buttons */}
      {showUI && (
        <>
          <button
            onClick={() => hasPrev && goPrev()}
            disabled={!hasPrev}
            aria-label="Previous"
            className={`absolute left-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/10 hover:bg-white/20 ${
              !hasPrev ? "opacity-30 cursor-not-allowed" : ""
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => hasNext && goNext()}
            disabled={!hasNext}
            aria-label="Next"
            className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/10 hover:bg-white/20 ${
              !hasNext ? "opacity-30 cursor-not-allowed" : ""
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
