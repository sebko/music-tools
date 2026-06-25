import { useState, useEffect, useRef } from "react";
import { cn, Button } from "@music-tools/my-component-library";
import { useAlbum } from "../hooks/useAlbum";
import { getAlbumArtworkUrl } from "../api/albums";
import { Check, Upload, ExternalLink, Link, AlertCircle } from "lucide-react";

function buildMusichoardersUrl(album) {
  const params = new URLSearchParams();
  if (album?.artist) params.set("artist", album.artist);
  if (album?.title) params.set("album", album.title);
  return `https://covers.musichoarders.xyz/?${params.toString()}`;
}

function ArtworkSearchModal({ isOpen, onClose, albumId, onSelectArtwork }) {
  const [pastedUrl, setPastedUrl] = useState("");
  const [urlPreviewStatus, setUrlPreviewStatus] = useState("idle"); // idle | loading | loaded | error
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [selectionMode, setSelectionMode] = useState(null); // null | 'url' | 'upload'
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  const { data: album } = useAlbum(albumId);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPastedUrl("");
      setUrlPreviewStatus("idle");
      setUploadedFile(null);
      setUploadPreview(null);
      setSelectionMode(null);
    }
  }, [isOpen]);

  // Debounce URL preview loading
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!pastedUrl.trim()) {
      setUrlPreviewStatus("idle");
      return;
    }

    debounceRef.current = setTimeout(() => {
      setUrlPreviewStatus("loading");
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [pastedUrl]);

  if (!isOpen) {
    return null;
  }

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setPastedUrl(url);
    // Clear upload when typing a URL
    if (url.trim()) {
      setUploadedFile(null);
      setUploadPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectionMode("url");
    } else {
      setSelectionMode(null);
    }
  };

  const handleUrlImageLoad = () => {
    setUrlPreviewStatus("loaded");
  };

  const handleUrlImageError = () => {
    setUrlPreviewStatus("error");
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      alert("Please select a JPEG or PNG image");
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      return;
    }

    setUploadedFile(file);
    setSelectionMode("upload");
    // Clear URL input when uploading
    setPastedUrl("");
    setUrlPreviewStatus("idle");

    // Generate preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSelection = () => {
    if (selectionMode === "upload" && uploadedFile) {
      onSelectArtwork({
        type: "upload",
        file: uploadedFile,
        preview: uploadPreview,
      });
    } else if (
      selectionMode === "url" &&
      pastedUrl.trim() &&
      urlPreviewStatus === "loaded"
    ) {
      onSelectArtwork({ type: "url", url: pastedUrl.trim() });
    } else {
      return;
    }
    onClose();
  };

  const isConfirmDisabled =
    !(selectionMode === "url" && urlPreviewStatus === "loaded") &&
    !(selectionMode === "upload" && uploadedFile);

  const artworkUrl = album ? getAlbumArtworkUrl(albumId) : null;

  return (
    <div
      className="fixed inset-0 bg-foreground/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="modal-brutalist max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-border flex-shrink-0">
          <h2 className="text-xl font-heading text-foreground">
            Find Album Artwork
          </h2>
          {album && (
            <p className="text-sm text-foreground/60 mt-1">
              {album.artist} - {album.title} {album.year && `(${album.year})`}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">
          {/* Current Artwork */}
          {artworkUrl && (
            <div>
              <h3 className="text-sm font-heading text-foreground mb-3 uppercase tracking-wide">
                Current Artwork
              </h3>
              <div className="w-32 aspect-square rounded-base border-2 border-border overflow-hidden">
                <img
                  src={artworkUrl}
                  alt="Current album artwork"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.closest("div.w-32").style.display = "none";
                  }}
                />
              </div>
            </div>
          )}

          {/* MusicHoarders Search Section */}
          <div className="rounded-base border-2 border-border bg-background p-4">
            <h3 className="text-sm font-heading text-foreground mb-2 uppercase tracking-wide">
              Search for Hi-Res Artwork
            </h3>
            <p className="text-sm text-foreground/60 mb-4">
              Search across 30+ sources including Spotify, Apple Music, Discogs,
              Bandcamp, and more. Find artwork, then copy the image URL or
              download it.
            </p>
            <Button
              onClick={() =>
                window.open(buildMusichoardersUrl(album), "_blank")
              }
              variant="primary"
              size="sm"
            >
              <ExternalLink className="h-4 w-4" />
              Search on MusicHoarders
            </Button>
          </div>

          {/* Paste URL Section */}
          <div>
            <h3 className="text-sm font-heading text-foreground mb-3 uppercase tracking-wide">
              Paste Image URL
            </h3>
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <input
                    type="text"
                    value={pastedUrl}
                    onChange={handleUrlChange}
                    placeholder="https://example.com/artwork.jpg"
                    className={cn(
                      "w-full pl-10 pr-4 py-2 rounded-base border-2 bg-background text-foreground text-sm",
                      "placeholder:text-foreground/30 focus:outline-none focus:border-main",
                      urlPreviewStatus === "error"
                        ? "border-red-500"
                        : "border-border"
                    )}
                  />
                </div>
                {urlPreviewStatus === "error" && (
                  <div className="flex items-center gap-1.5 mt-2 text-red-500 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Could not load image. Try downloading it and uploading
                      instead.
                    </span>
                  </div>
                )}
              </div>
              {urlPreviewStatus === "loading" || urlPreviewStatus === "loaded" ? (
                <div
                  className={cn(
                    "w-32 aspect-square rounded-base border-2 overflow-hidden flex-shrink-0",
                    urlPreviewStatus === "loaded"
                      ? "border-main"
                      : "border-border"
                  )}
                >
                  <img
                    src={pastedUrl}
                    alt="URL artwork preview"
                    className={cn(
                      "w-full h-full object-cover",
                      urlPreviewStatus === "loading" && "opacity-50"
                    )}
                    onLoad={handleUrlImageLoad}
                    onError={handleUrlImageError}
                  />
                  {urlPreviewStatus === "loaded" && (
                    <div className="absolute top-1 right-1">
                      <div className="w-5 h-5 rounded-full bg-main border-2 border-border flex items-center justify-center">
                        <Check className="h-3 w-3 text-background" />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Upload Custom Artwork Section */}
          <div>
            <h3 className="text-sm font-heading text-foreground mb-3 uppercase tracking-wide">
              Upload Custom Artwork
            </h3>
            <div className="flex gap-4 items-start">
              {uploadPreview ? (
                <div className="flex gap-4 items-center">
                  <div className="w-32 aspect-square rounded-base border-2 border-main overflow-hidden relative">
                    <img
                      src={uploadPreview}
                      alt="Uploaded artwork preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 right-1">
                      <div className="w-5 h-5 rounded-full bg-main border-2 border-border flex items-center justify-center">
                        <Check className="h-3 w-3 text-background" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-foreground/70">
                      {uploadedFile?.name}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {(uploadedFile?.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      onClick={() => {
                        setUploadedFile(null);
                        setUploadPreview(null);
                        setSelectionMode(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="artwork-upload"
                  />
                  <label
                    htmlFor="artwork-upload"
                    className={cn(
                      "flex flex-col items-center justify-center",
                      "w-full h-32 border-2 border-dashed border-border rounded-base",
                      "cursor-pointer transition-all duration-200",
                      "hover:border-main hover:bg-main/5"
                    )}
                  >
                    <Upload className="h-8 w-8 text-foreground/30 mb-2" />
                    <p className="text-sm text-foreground/60">
                      Click to upload JPEG or PNG
                    </p>
                    <p className="text-xs text-foreground/40 mt-1">
                      Maximum file size: 10MB
                    </p>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-2 border-border flex justify-end items-center flex-shrink-0">
          <div className="flex gap-3">
            <Button onClick={onClose} variant="secondary" size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSelection}
              variant="primary"
              size="sm"
              isDisabled={isConfirmDisabled}
            >
              <Check className="h-4 w-4" />
              Select Artwork
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArtworkSearchModal;
