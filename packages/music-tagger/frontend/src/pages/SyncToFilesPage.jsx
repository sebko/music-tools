import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAlbums } from "../hooks/useAlbums";
import { useBulkSyncToFiles } from "../hooks/useBulkSyncToFiles";
import { PageLoader, FilterToggle, Button, cn } from "@dj-tools/my-component-library";
import BulkSyncToFilesFieldsModal from "../components/BulkSyncToFilesFieldsModal";
import BulkSyncToFilesProgressModal from "../components/BulkSyncToFilesProgressModal";
import {
  Music,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

function SyncToFilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Bulk sync modal state
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Bulk sync hook
  const { startSync, isSyncing } = useBulkSyncToFiles(true);

  // Auto-open progress modal if sync is already running on mount
  useEffect(() => {
    if (isSyncing && !showProgressModal && !showFieldsModal) {
      setShowProgressModal(true);
    }
  }, [isSyncing, showProgressModal, showFieldsModal]);

  // Tab state from URL params (default to "unsynced")
  const activeTab = searchParams.get("tab") || "unsynced";

  // Secondary filter for synced tab (artwork quality or sync completeness)
  const qualityFilter = searchParams.get("quality") || "all";

  // Pagination from URL params
  const limit = parseInt(searchParams.get("limit")) || 50;
  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);

  // Map quality filter to API params
  const artworkQuality = qualityFilter === "non-hd" ? "non-hd" : "";
  const syncCompleteness = qualityFilter === "incomplete" ? "incomplete" : "";

  // Fetch albums filtered by sync status and quality
  const { data, isLoading, isError, error } = useAlbums(
    page,
    limit,
    "addedAt",
    "desc",
    "",
    "synced", // Only show albums that have been synced to Plex
    activeTab, // fileSyncStatus filter
    artworkQuality,
    syncCompleteness
  );

  // Fetch counts for both tabs (only count albums synced to Plex)
  const { data: unsyncedData } = useAlbums(1, 1, "addedAt", "desc", "", "synced", "unsynced");
  const { data: syncedData } = useAlbums(1, 1, "addedAt", "desc", "", "synced", "synced");

  const albums = data?.albums || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
    hasNext: false,
    hasPrev: false,
  };

  // Get counts from both tab queries
  const unsyncedCount = unsyncedData?.pagination?.total ?? 0;
  const syncedCount = syncedData?.pagination?.total ?? 0;

  const handlePageChange = (newPage) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.page = newPage.toString();
    setSearchParams(newParams);
  };

  const handleTabChange = (tab) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.tab = tab;
    newParams.page = "1"; // Reset to first page on tab change
    // Reset quality filter when switching tabs
    delete newParams.quality;
    setSearchParams(newParams);
  };

  const handleQualityFilterChange = (filter) => {
    const newParams = Object.fromEntries(searchParams.entries());
    if (filter === "all") {
      delete newParams.quality;
    } else {
      newParams.quality = filter;
    }
    newParams.page = "1"; // Reset to first page on filter change
    setSearchParams(newParams);
  };

  // Bulk sync handlers
  const handleOpenBulkSync = () => {
    setShowFieldsModal(true);
  };

  const handleStartBulkSync = async (selectedFields) => {
    try {
      await startSync.mutateAsync({
        selectedFields,
        resync: activeTab === "synced",
      });
      setShowFieldsModal(false);
      setShowProgressModal(true);
    } catch (error) {
      console.error("Failed to start bulk sync:", error);
    }
  };

  const handleCloseFieldsModal = () => {
    setShowFieldsModal(false);
  };

  const handleCloseProgressModal = () => {
    setShowProgressModal(false);
  };

  const handleSyncComplete = () => {
    setShowProgressModal(false);
    // Switch to synced tab to see results
    handleTabChange("synced");
  };

  if (isLoading) {
    return <PageLoader message="Loading albums..." />;
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-heading text-foreground mb-2">
          Error loading albums
        </h2>
        <p className="text-foreground/60">{error?.message}</p>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-heading text-foreground mb-2">
            Sync to Files
          </h1>
          <p className="text-foreground/60">
            Write Plex metadata (genres, styles) to your local audio file tags.
          </p>
        </div>

        {/* Filter Toggle */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <FilterToggle
            activeFilter={activeTab}
            onFilterChange={handleTabChange}
            filters={[
              { key: 'unsynced', label: `Unsynced (${unsyncedCount})` },
              { key: 'synced', label: `Synced (${syncedCount})` }
            ]}
          />

          {/* Secondary filter - only show when synced tab is active */}
          {activeTab === "synced" && (
            <FilterToggle
              activeFilter={qualityFilter}
              onFilterChange={handleQualityFilterChange}
              filters={[
                { key: 'all', label: 'All' },
                { key: 'non-hd', label: 'Non-HD Artwork' },
                { key: 'incomplete', label: 'Incomplete Sync' }
              ]}
            />
          )}
        </div>

        <div className="text-center py-12">
          <Music className="w-16 h-16 mx-auto text-foreground/30 mb-4" />
          <h2 className="text-xl font-heading text-foreground mb-2">
            {activeTab === "synced"
              ? qualityFilter === "non-hd"
                ? "No non-HD artwork albums"
                : qualityFilter === "incomplete"
                  ? "No incomplete sync albums"
                  : "No synced albums"
              : "No unsynced albums"}
          </h2>
          <p className="text-foreground/60">
            {activeTab === "synced"
              ? qualityFilter === "non-hd"
                ? "All synced albums have HD artwork."
                : qualityFilter === "incomplete"
                  ? "All synced albums have all fields synced."
                  : "Sync albums from the Unsynced tab to see them here."
              : "All albums have been synced to files."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        {/* Title and subtitle row */}
        <div className="mb-4">
          <h1 className="text-2xl font-heading text-foreground">
            Sync to Files
          </h1>
          <p className="text-foreground/60 mt-1">
            {pagination.total} albums - Page {pagination.page} of {pagination.pages}
          </p>
        </div>

        {/* Toolbar row: filters on left, actions on right */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left side: Filter toggles */}
          <div className="flex flex-wrap items-center gap-4">
            <FilterToggle
              activeFilter={activeTab}
              onFilterChange={handleTabChange}
              filters={[
                { key: 'unsynced', label: `Unsynced (${unsyncedCount})` },
                { key: 'synced', label: `Synced (${syncedCount})` }
              ]}
            />

            {/* Secondary filter - only show when synced tab is active */}
            {activeTab === "synced" && (
              <FilterToggle
                activeFilter={qualityFilter}
                onFilterChange={handleQualityFilterChange}
                filters={[
                  { key: 'all', label: 'All' },
                  { key: 'non-hd', label: 'Non-HD Artwork' },
                  { key: 'incomplete', label: 'Incomplete Sync' }
                ]}
              />
            )}
          </div>

          {/* Right side: Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Bulk Sync Button - show on unsynced tab */}
            {activeTab === "unsynced" && unsyncedCount > 0 && (
              <Button
                onClick={handleOpenBulkSync}
                variant="primary"
                size="sm"
                isDisabled={isSyncing}
              >
                <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                {isSyncing ? "Syncing..." : "Bulk Sync"}
              </Button>
            )}

            {/* Bulk Re-sync Button - show on synced tab */}
            {activeTab === "synced" && syncedCount > 0 && (
              <Button
                onClick={handleOpenBulkSync}
                variant="primary"
                size="sm"
                isDisabled={isSyncing}
              >
                <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                {isSyncing ? "Syncing..." : "Bulk Re-sync"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Albums Grid - same layout as AlbumsPage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8 gap-6">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>

      {/* Pagination Controls */}
      {pagination.pages > 1 && (
        <div className="flex justify-center items-center space-x-4 mt-8">
          <Button
            onClick={() => handlePageChange(pagination.page - 1)}
            variant={pagination.hasPrev ? "primary" : "secondary"}
            size="sm"
            isDisabled={!pagination.hasPrev}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <span className="text-foreground font-heading">
            Page {pagination.page} of {pagination.pages}
          </span>

          <Button
            onClick={() => handlePageChange(pagination.page + 1)}
            variant={pagination.hasNext ? "primary" : "secondary"}
            size="sm"
            isDisabled={!pagination.hasNext}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Bulk Sync Modals */}
      <BulkSyncToFilesFieldsModal
        isOpen={showFieldsModal}
        onClose={handleCloseFieldsModal}
        onStartSync={handleStartBulkSync}
        unsyncedCount={unsyncedCount}
        isStarting={startSync.isPending}
      />

      <BulkSyncToFilesProgressModal
        isOpen={showProgressModal}
        onClose={handleCloseProgressModal}
        onComplete={handleSyncComplete}
      />
    </div>
  );
}

/**
 * Album card component - matches AlbumsPage card design
 */
function AlbumCard({ album }) {
  // Format last synced date
  const formatSyncDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const isSynced = album.fileSyncStatus === "synced";
  const syncedDate = formatSyncDate(album.fileSyncedAt);

  return (
    <Link to={`/sync-to-files/${album.id}`}>
      <div
        className={cn(
          "card-brutalist transition-all duration-200 group",
          "hover:shadow-main hover:border-main hover:-translate-x-1 hover:-translate-y-1",
          "active:shadow-none active:translate-x-0 active:translate-y-0"
        )}
      >
        {/* Album Artwork */}
        <div className="aspect-square bg-background-secondary rounded-base mb-3 flex items-center justify-center overflow-hidden border-2 border-border relative">
          {album.hasArtwork && album.artworkThumbUrl ? (
            <img
              src={album.artworkThumbUrl}
              alt={album.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "block";
              }}
            />
          ) : null}
          <div
            className="text-foreground/30"
            style={{
              display: album.hasArtwork && album.artworkThumbUrl ? "none" : "block",
            }}
          >
            <Music className="w-10 h-10" />
          </div>

          {/* Synced badge - bottom-right */}
          {isSynced && (
            <div
              className={cn(
                "absolute bottom-2 right-2 px-1.5 py-0.5 rounded-sm",
                "bg-green-600/90 text-white backdrop-blur-sm",
                "text-[10px] font-bold tracking-wide",
                "border border-green-400/30"
              )}
              title={`Synced ${syncedDate || ''}`}
            >
              <Check className="w-3 h-3 inline" />
            </div>
          )}
        </div>

        {/* Album Info */}
        <h3 className="font-heading text-foreground truncate">
          {album.title || "Unknown Album"}
        </h3>
        <p className="text-sm text-foreground/60 truncate">
          {isSynced && syncedDate ? `Synced ${syncedDate}` : album.artist || "Unknown Artist"}
        </p>
      </div>
    </Link>
  );
}

export default SyncToFilesPage;
