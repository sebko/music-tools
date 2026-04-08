import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAlbums } from "../hooks/useAlbums";
import { useLibraryScanManager } from "../hooks/useLibraryScanManager";
import { useBulkMetadataScan } from "../hooks/useBulkMetadataScan";
import { useBulkMetadataSync } from "../hooks/useBulkMetadataSync";
import ScanProgressModal from "../components/ScanProgressModal";
import BulkScanProgressModal from "../components/BulkScanProgressModal";
import BulkSyncFieldsModal from "../components/BulkSyncFieldsModal";
import BulkSyncProgressModal from "../components/BulkSyncProgressModal";
import {
  PageLoader,
  SelectBrutalist,
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
import LightboxWithNavigation from "../components/LightboxWithNavigation";
import UnmatchedView from "../components/UnmatchedView";
import MatchedView from "../components/MatchedView";
import { calculateSyncStatus } from "../utils/syncStatus";
import {
  Music,
  Search,
  ArrowUp,
  ArrowDown,
  ZoomIn,
  RefreshCw,
} from "lucide-react";

function AlbumsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get limit from URL params, default to 50
  const limit = parseInt(searchParams.get("limit")) || 50;

  // Get page from URL params, default to 1, validate as positive integer
  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);

  // Get sort parameters from URL
  const sortBy = searchParams.get("sortBy") || "addedAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  // Get search parameter from URL
  const searchQuery = searchParams.get("search") || "";

  // Get filter parameter from URL - default to "unmatched" if not specified
  const matchFilter = searchParams.get("filter") || "unmatched";

  // Secondary filter for synced view (artwork quality or sync completeness)
  const qualityFilter = searchParams.get("quality") || "all";

  // Map quality filter to API params
  const artworkQuality = qualityFilter === "non-hd" ? "non-hd" : "";
  const syncCompleteness = qualityFilter === "incomplete" ? "incomplete" : "";

  const { data, isLoading, isError, error } = useAlbums(
    page,
    limit,
    sortBy,
    sortOrder,
    searchQuery,
    matchFilter,
    "", // fileSyncStatus (not used on this page)
    artworkQuality,
    syncCompleteness
  );
  const {
    showScanModal,
    handleStartScan,
    handleScanComplete,
    handleCloseScanModal,
    isStartingScan,
  } = useLibraryScanManager();

  // Auto-start scan when navigated here with ?scan=true
  // useRef prevents double-invocation from React StrictMode
  const autoScanFiredRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("scan") !== "true") return;
    if (autoScanFiredRef.current) return;
    autoScanFiredRef.current = true;
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("scan");
    setSearchParams(newParams, { replace: true });
    handleStartScan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bulk metadata scan hook
  const { startScan, isScanning } = useBulkMetadataScan();

  // Bulk scan modal state
  const [showBulkScanModal, setShowBulkScanModal] = useState(false);

  // Bulk metadata sync hook
  const { startSync, isSyncing } = useBulkMetadataSync();

  // Bulk sync modal states
  const [showBulkSyncFieldsModal, setShowBulkSyncFieldsModal] = useState(false);
  const [showBulkSyncProgressModal, setShowBulkSyncProgressModal] = useState(false);


  // Lightbox state for fullscreen artwork viewing
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxGlobalIndex, setLightboxGlobalIndex] = useState(null);

  // Simple search state
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Update search input when URL changes
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Check if bulk scan is already running on mount and auto-open modal
  useEffect(() => {
    if (isScanning) {
      setShowBulkScanModal(true);
    }
  }, [isScanning]);

  // Check if bulk sync is already running on mount and auto-open modal
  useEffect(() => {
    if (isSyncing) {
      setShowBulkSyncProgressModal(true);
    }
  }, [isSyncing]);

  // Handle search submission (SearchInput passes value string)
  const handleSearchSubmitValue = (val) => {
    const trimmed = (val || searchInput).trim();
    const newParams = Object.fromEntries(searchParams.entries());
    if (trimmed) {
      newParams.search = trimmed;
    } else {
      delete newParams.search;
    }
    newParams.page = "1"; // Reset to first page on search
    setSearchParams(newParams);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    const newParams = Object.fromEntries(searchParams.entries());
    delete newParams.search;
    newParams.page = "1";
    setSearchParams(newParams);
  };

  const handleFilterChange = (newFilter) => {
    const newParams = Object.fromEntries(searchParams.entries());
    if (newFilter === "unmatched") {
      // Remove filter param for default "unmatched" state
      delete newParams.filter;
    } else {
      newParams.filter = newFilter;
    }
    // Reset quality filter when changing tabs
    delete newParams.quality;
    newParams.page = "1"; // Reset to first page when filter changes
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

  const albums = data?.albums || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
    hasNext: false,
    hasPrev: false,
  };

  const handlePageChange = (newPage) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.page = newPage.toString();
    setSearchParams(newParams);
  };

  const handleSortChange = (newSortBy, newSortOrder = sortOrder) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.sortBy = newSortBy;
    newParams.sortOrder = newSortOrder;
    newParams.page = "1"; // Reset to first page when sorting changes
    setSearchParams(newParams);
  };

  const handleLimitChange = (newLimit) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.limit = newLimit.toString();
    newParams.page = "1"; // Reset to first page when page size changes
    setSearchParams(newParams);
  };

  const handleViewArtwork = (event, indexInPage) => {
    event.preventDefault();
    event.stopPropagation();
    // Calculate global index: (page - 1) * limit + indexInPage
    const globalIndex = (page - 1) * limit + indexInPage;
    setLightboxGlobalIndex(globalIndex);
    setLightboxOpen(true);
  };

  const handleScanCompleteWithReset = () => {
    // Reset to page 1 with default parameters to ensure fresh view
    const newParams = new URLSearchParams();
    newParams.set("page", "1");
    newParams.set("limit", "50");
    newParams.set("sortBy", "addedAt");
    newParams.set("sortOrder", "desc");
    setSearchParams(newParams);

    // Call the original scan complete handler
    handleScanComplete();
  };

  // Check if database is being set up
  const isDatabaseSetup = isError && error?.requiresSetup;

  if (isLoading || isDatabaseSetup) {
    const message = isDatabaseSetup
      ? "Setting up database... This may take a moment."
      : "Loading albums...";
    return <PageLoader message={message} />;
  }


  let mainContent;
  if (isError) {
    mainContent = (
      <UnmatchedView
        onButtonClick={handleStartScan}
        isStarting={isStartingScan}
        buttonText="Rescan"
      />
    );
  } else if (albums.length === 0) {
    // Show different message if searching with no results
    if (searchQuery) {
      mainContent = (
        <EmptyState
          icon={<Search className="w-16 h-16" />}
          heading={`No results for "${searchQuery}"`}
          description="Try adjusting your search terms or clear the search to see all albums."
          action={
            <Button onClick={handleClearSearch} variant="primary" size="lg">
              Clear Search
            </Button>
          }
        />
      );
    } else {
      // Show different empty states based on match filter
      if (matchFilter === 'unmatched') {
        mainContent = (
          <EmptyState
            icon={<Music className="w-16 h-16 text-main animate-pulse" />}
            heading="No albums yet"
            description="Connect your Plex library to import albums."
            action={
              <Link to="/settings">
                <Button variant="primary" size="lg">
                  Connect Plex
                </Button>
              </Link>
            }
          />
        );
      } else if (matchFilter === 'matched') {
        mainContent = <MatchedView />;
      }
    }
  } else {
    mainContent = (
      <>
        <CardGrid>
          {albums.map((album, indexInPage) => {
            // Matched and synced albums go to sync page; unmatched go to details page
            const linkPath = ((album.matchStatus === 'MATCHED' || album.matchStatus === 'SYNCED') && album.redactedId)
              ? `/albums/${album.id}/sync/${album.redactedId}`
              : `/albums/${album.id}`;

            return (
              <Link key={album.id} to={linkPath}>
                <MediaCard
                  imageSrc={album.hasArtwork && album.artworkThumbUrl ? album.artworkThumbUrl : undefined}
                  imageAlt={album.title}
                  title={album.title || "Unknown Album"}
                  subtitle={album.artist || "Unknown Artist"}
                  badges={
                    <>
                      {album.hasMusicBrainzMatch && (
                        <Badge variant="info" position="top-left" title="Has MusicBrainz metadata">
                          MB
                        </Badge>
                      )}
                      {album.redactedId && <AlbumCardBadges album={album} />}
                    </>
                  }
                  actions={
                    album.hasArtwork && (
                      <button
                        onClick={(e) => handleViewArtwork(e, indexInPage)}
                        className={cn(
                          "absolute top-2 right-2 p-1.5 rounded-base",
                          "bg-black/60 text-white backdrop-blur-sm",
                          "hover:bg-black/80 hover:scale-110",
                          "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2",
                          "w-7 h-7 flex items-center justify-center"
                        )}
                        aria-label="View artwork fullscreen"
                        title="View artwork fullscreen"
                      >
                        <ZoomIn className="w-3 h-3" />
                      </button>
                    )
                  }
                />
              </Link>
            );
          })}
        </CardGrid>

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pages}
            onPageChange={handlePageChange}
            className="mt-8"
          />
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Albums"
        subtitle={
          isError
            ? "We were unable to load your library. Try running a scan to rebuild it."
            : pagination.total === 0
            ? searchQuery
              ? `No albums found for "${searchQuery}"`
              : 'No albums found. Use "Scan Library" to import your music.'
            : searchQuery
            ? `${pagination.total} albums found for "${searchQuery}" - Page ${pagination.page} of ${pagination.pages}`
            : `${pagination.total} albums total - Page ${pagination.page} of ${pagination.pages}`
        }
      >
        <Toolbar
          left={
            <FilterToggle
              activeFilter={matchFilter}
              onFilterChange={handleFilterChange}
              filters={[
                { key: 'unmatched', label: 'Unmatched' },
                { key: 'matched', label: 'Matched' },
                { key: 'synced', label: 'Synced' }
              ]}
            />
          }
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

              {pagination.total > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="limit-select"
                      className="text-sm font-heading text-foreground"
                    >
                      Show:
                    </label>
                    <SelectBrutalist
                      id="limit-select"
                      value={limit}
                      onChange={(e) =>
                        handleLimitChange(parseInt(e.target.value))
                      }
                      options={[
                        { value: 20, label: "20" },
                        { value: 50, label: "50" },
                        { value: 100, label: "100" },
                        { value: 200, label: "200" },
                      ]}
                      className="w-20"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="sort-select"
                      className="text-sm font-heading text-foreground"
                    >
                      Sort:
                    </label>
                    <SelectBrutalist
                      id="sort-select"
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value)}
                      options={[
                        { value: "addedAt", label: "Date Added" },
                        { value: "titleSort", label: "Album Title" },
                        { value: "year", label: "Release Year" },
                        { value: "folderCreatedAt", label: "Folder Created" },
                      ]}
                      className="w-36"
                    />
                    <Button
                      onClick={() =>
                        handleSortChange(
                          sortBy,
                          sortOrder === "asc" ? "desc" : "asc"
                        )
                      }
                      variant="default"
                      size="sm"
                      title={`Sort ${
                        sortOrder === "asc" ? "descending" : "ascending"
                      }`}
                    >
                      {sortOrder === "asc" ? (
                        <ArrowUp className="w-4 h-4" />
                      ) : (
                        <ArrowDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {/* Rescan button - only show on unmatched filter */}
                  {matchFilter === "unmatched" && (
                    <Button
                      onClick={handleStartScan}
                      variant="primary"
                      size="sm"
                      isDisabled={isStartingScan}
                    >
                      <Search className="w-4 h-4" />
                      {isStartingScan ? "Starting..." : "Rescan"}
                    </Button>
                  )}

                  {/* Bulk Scan button - only show on unmatched filter */}
                  {matchFilter === "unmatched" && (
                    <Button
                      onClick={async () => {
                        try {
                          await startScan.mutateAsync({
                            minConfidence: 85,
                            includeMatched: false
                          });
                          setShowBulkScanModal(true);
                        } catch (error) {
                          console.error("Failed to start bulk scan:", error);
                          const isAlreadyRunning = error.message?.includes('already in progress');
                          if (isAlreadyRunning) {
                            setShowBulkScanModal(true);
                          }
                        }
                      }}
                      variant="secondary"
                      size="sm"
                      isDisabled={isScanning || startScan.isPending}
                    >
                      <Search className="w-4 h-4" />
                      {startScan.isPending ? "Starting..." : "Bulk Scan"}
                    </Button>
                  )}

                  {/* Bulk Sync button - only show on matched filter */}
                  {matchFilter === "matched" && (
                    <Button
                      onClick={() => setShowBulkSyncFieldsModal(true)}
                      variant="primary"
                      size="sm"
                      isDisabled={isSyncing || startSync.isPending}
                    >
                      <RefreshCw className="w-4 h-4" />
                      {isSyncing ? "Syncing..." : "Bulk Sync"}
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        />

        {/* Secondary filter row - only show when synced tab is active */}
        {matchFilter === "synced" && (
          <div className="mt-4">
            <FilterToggle
              activeFilter={qualityFilter}
              onFilterChange={handleQualityFilterChange}
              filters={[
                { key: 'all', label: 'All' },
                { key: 'non-hd', label: 'Non-HD Artwork' },
                { key: 'incomplete', label: 'Incomplete Sync' }
              ]}
            />
          </div>
        )}
      </PageHeader>

      {mainContent}

      {showScanModal && (
        <ScanProgressModal
          isOpen={showScanModal}
          onClose={handleCloseScanModal}
          onComplete={handleScanCompleteWithReset}
        />
      )}

      <BulkScanProgressModal
        isOpen={showBulkScanModal}
        onClose={() => setShowBulkScanModal(false)}
        onComplete={() => {
          setShowBulkScanModal(false);
          // Refresh albums list
          const newParams = Object.fromEntries(searchParams.entries());
          setSearchParams(newParams);
        }}
      />

      {/* Bulk Sync Field Selection Modal */}
      <BulkSyncFieldsModal
        isOpen={showBulkSyncFieldsModal}
        onClose={() => setShowBulkSyncFieldsModal(false)}
        matchedCount={pagination.total}
        isStarting={startSync.isPending}
        onStartSync={async (selectedFields) => {
          try {
            await startSync.mutateAsync(selectedFields);
            setShowBulkSyncFieldsModal(false);
            setShowBulkSyncProgressModal(true);
          } catch (error) {
            console.error("Failed to start bulk sync:", error);
            const isAlreadyRunning = error.message?.includes("already in progress");
            if (isAlreadyRunning) {
              setShowBulkSyncFieldsModal(false);
              setShowBulkSyncProgressModal(true);
            }
          }
        }}
      />

      {/* Bulk Sync Progress Modal */}
      <BulkSyncProgressModal
        isOpen={showBulkSyncProgressModal}
        onClose={() => setShowBulkSyncProgressModal(false)}
        onComplete={() => {
          setShowBulkSyncProgressModal(false);
          // Refresh albums list
          const newParams = Object.fromEntries(searchParams.entries());
          setSearchParams(newParams);
        }}
      />

      {/* Lightbox for fullscreen artwork viewing with cross-pagination navigation */}
      {lightboxOpen && lightboxGlobalIndex !== null && pagination.total > 0 && (
        <LightboxWithNavigation
          initialGlobalIndex={lightboxGlobalIndex}
          pageSize={limit}
          sortBy={sortBy}
          sortOrder={sortOrder}
          filter={matchFilter}
          search={searchQuery}
          totalAlbums={pagination.total}
          artworkQuality={artworkQuality}
          syncCompleteness={syncCompleteness}
          onClose={() => {
            setLightboxOpen(false);
            setLightboxGlobalIndex(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * AlbumCardBadges - Shows sync status and artwork quality badges on album cards
 * Fetches Redacted data to calculate sync status (same logic as SyncMetadataPage)
 * Uses server-side HD artwork status for performance (no client-side image loading)
 */
function AlbumCardBadges({ album }) {
  const [syncStatus, setSyncStatus] = useState(null);

  // Fetch Redacted data and calculate sync status
  useEffect(() => {
    if (!album.redactedId) return;

    fetch(`/api/metadata/redacted/${album.redactedId}`)
      .then((res) => res.json())
      .then((result) => {
        const status = calculateSyncStatus(album, result.data);
        setSyncStatus(status);
      })
      .catch(() => setSyncStatus({ allSynced: false }));
  }, [album, album.redactedId]);

  return (
    <>
      {/* Sync status badge - bottom-right */}
      {syncStatus?.allSynced && (
        <Badge variant="success" position="bottom-right" title="All fields synced">
          ✓
        </Badge>
      )}

      {/* HD artwork badge - bottom-left (uses server-side calculated status) */}
      {album.isHdArtwork && (
        <Badge variant="accent" position="bottom-left" title="High-resolution artwork (≥1400×1400)">
          HD
        </Badge>
      )}
    </>
  );
}

export default AlbumsPage;
