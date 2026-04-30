import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAlbums } from "../hooks/useAlbums";
import { useBulkSyncToFiles } from "../hooks/useBulkSyncToFiles";
import {
  PageLoader,
  FilterToggle,
  Button,
  cn,
  PageHeader,
  Toolbar,
  SearchInput,
  CardGrid,
  MediaCard,
  Badge,
  Pagination,
  EmptyState,
} from "@dj-tools/my-component-library";
import BulkSyncToFilesFieldsModal from "../components/BulkSyncToFilesFieldsModal";
import BulkSyncToFilesProgressModal from "../components/BulkSyncToFilesProgressModal";
import {
  Music,
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

  // Search from URL params
  const searchQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

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
    searchQuery,
    "synced", // Only show albums that have been synced to Plex
    activeTab, // fileSyncStatus filter
    artworkQuality,
    syncCompleteness
  );

  // Fetch counts for both tabs (only count albums synced to Plex)
  // Counts are NOT scoped by search — they reflect the whole library so the
  // user can see global tab totals regardless of what they typed.
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

  const handleSearchSubmitValue = (val) => {
    const trimmed = (val ?? searchInput).trim();
    const newParams = Object.fromEntries(searchParams.entries());
    if (trimmed) {
      newParams.search = trimmed;
    } else {
      delete newParams.search;
    }
    newParams.page = "1";
    setSearchParams(newParams);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    const newParams = Object.fromEntries(searchParams.entries());
    delete newParams.search;
    newParams.page = "1";
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
      <EmptyState
        icon={<AlertCircle className="w-16 h-16 text-red-500" />}
        heading="Error loading albums"
        description={error?.message}
      />
    );
  }

  // Filter controls shared between empty and populated states
  const filterControls = (
    <div className="flex flex-wrap items-center gap-4">
      <FilterToggle
        activeFilter={activeTab}
        onFilterChange={handleTabChange}
        filters={[
          { key: 'unsynced', label: `Unsynced (${unsyncedCount})` },
          { key: 'synced', label: `Synced (${syncedCount})` }
        ]}
      />
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
  );

  if (albums.length === 0) {
    return (
      <div>
        <PageHeader
          title="Sync to Files"
          subtitle="Write Plex metadata (genres, styles) to your local audio file tags."
        >
          <Toolbar
            left={filterControls}
            right={
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={handleSearchSubmitValue}
                onClear={handleClearSearch}
                placeholder="Search albums"
                className="w-48"
              />
            }
          />
        </PageHeader>

        <EmptyState
          icon={<Music className="w-16 h-16" />}
          heading={
            searchQuery
              ? `No albums match "${searchQuery}"`
              : activeTab === "synced"
                ? qualityFilter === "non-hd"
                  ? "No non-HD artwork albums"
                  : qualityFilter === "incomplete"
                    ? "No incomplete sync albums"
                    : "No synced albums"
                : "No unsynced albums"
          }
          description={
            searchQuery
              ? "Try a different search or clear it to see all albums."
              : activeTab === "synced"
                ? qualityFilter === "non-hd"
                  ? "All synced albums have HD artwork."
                  : qualityFilter === "incomplete"
                    ? "All synced albums have all fields synced."
                    : "Sync albums from the Unsynced tab to see them here."
                : "All albums have been synced to files."
          }
          action={
            searchQuery ? (
              <Button onClick={handleClearSearch} variant="primary" size="sm">
                Clear Search
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sync to Files"
        subtitle={`${pagination.total} albums - Page ${pagination.page} of ${pagination.pages}`}
      >
        <Toolbar
          left={filterControls}
          right={
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={handleSearchSubmitValue}
                onClear={handleClearSearch}
                placeholder="Search albums"
                className="w-48"
              />
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
          }
        />
      </PageHeader>

      <CardGrid>
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </CardGrid>

      {pagination.pages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.pages}
          onPageChange={handlePageChange}
          className="mt-8"
        />
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
 * Album card component - uses library MediaCard + Badge
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
      <MediaCard
        imageSrc={album.hasArtwork && album.artworkThumbUrl ? album.artworkThumbUrl : undefined}
        imageAlt={album.title}
        title={album.title || "Unknown Album"}
        subtitle={isSynced && syncedDate ? `Synced ${syncedDate}` : album.artist || "Unknown Artist"}
        badges={
          isSynced && (
            <Badge variant="success" position="bottom-right" title={`Synced ${syncedDate || ''}`}>
              <Check className="w-3 h-3 inline" />
            </Badge>
          )
        }
      />
    </Link>
  );
}

export default SyncToFilesPage;
