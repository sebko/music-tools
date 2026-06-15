import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSyncFailures, useFailureCounts, useClearSyncFailures } from "../hooks/useSyncFailures";
import { PageLoader, Button, FilterToggle, cn, PageHeader, Toolbar, SearchInput, EmptyState } from "@music-tools/my-component-library";
import {
  AlertCircle,
  CheckCircle,
  Trash2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

// Map operation types to display names
const OPERATION_LABELS = {
  bulk_scan: "Metadata Scan",
  bulk_sync_plex: "Sync to Plex",
  bulk_sync_files: "Sync to Files",
};

function SyncFailuresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlOperation = searchParams.get("operation");
  const [operationFilter, setOperationFilter] = useState(
    urlOperation && OPERATION_LABELS[urlOperation] ? urlOperation : "all"
  );

  const handleFilterChange = (next) => {
    setOperationFilter(next);
    if (next === "all") {
      searchParams.delete("operation");
    } else {
      searchParams.set("operation", next);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Search from URL params
  const searchQuery = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchSubmitValue = (val) => {
    const trimmed = (val ?? searchInput).trim();
    if (trimmed) {
      searchParams.set("search", trimmed);
    } else {
      searchParams.delete("search");
    }
    setSearchParams(searchParams, { replace: true });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    searchParams.delete("search");
    setSearchParams(searchParams, { replace: true });
  };

  // Fetch failures
  const operation = operationFilter === "all" ? null : operationFilter;
  const { data, isLoading, isError, error, refetch } = useSyncFailures(
    operation,
    100,
    searchQuery || null,
  );

  // Fetch counts for filter badges
  const { data: countsData } = useFailureCounts();

  // Clear failures mutation
  const clearMutation = useClearSyncFailures();

  const failures = data?.failures || [];
  const counts = countsData?.counts || {};
  const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to clear all failures?")) {
      await clearMutation.mutateAsync(null);
    }
  };

  // Format relative time
  const formatRelativeTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return <PageLoader message="Loading failures..." />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-16 h-16 text-red-500" />}
        heading="Error loading failures"
        description={error?.message}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Sync Failures"
        subtitle={`${totalCount} total failures`}
      >
        <Toolbar
          left={
            <FilterToggle
              activeFilter={operationFilter}
              onFilterChange={handleFilterChange}
              filters={[
                { key: "all", label: `All (${totalCount})` },
                { key: "bulk_scan", label: `Scan (${counts.bulk_scan || 0})` },
                { key: "bulk_sync_plex", label: `Plex (${counts.bulk_sync_plex || 0})` },
                { key: "bulk_sync_files", label: `Files (${counts.bulk_sync_files || 0})` },
              ]}
            />
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={handleSearchSubmitValue}
                onClear={handleClearSearch}
                placeholder="Search failures"
                className="w-48"
              />
              <Button
                onClick={() => refetch()}
                variant="secondary"
                size="sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              {totalCount > 0 && (
                <Button
                  onClick={handleClearAll}
                  variant="secondary"
                  size="sm"
                  isDisabled={clearMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              )}
            </div>
          }
        />
      </PageHeader>

      {failures.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-16 h-16 text-green-500" />}
          heading={
            searchQuery
              ? `No failures match "${searchQuery}"`
              : "No failures"
          }
          description={
            searchQuery
              ? "Try a different search or clear it to see all failures."
              : operationFilter === "all"
                ? "All sync operations completed successfully."
                : `No ${OPERATION_LABELS[operationFilter]} failures found.`
          }
          action={
            searchQuery ? (
              <Button onClick={handleClearSearch} variant="primary" size="sm">
                Clear Search
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          {failures.map((failure) => (
            <FailureCard
              key={failure.id}
              failure={failure}
              formatRelativeTime={formatRelativeTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual failure card component
 */
function FailureCard({ failure, formatRelativeTime }) {
  const [showDetails, setShowDetails] = useState(false);

  // Parse JSON details if present
  let details = null;
  if (failure.details) {
    try {
      details = JSON.parse(failure.details);
    } catch {
      details = failure.details;
    }
  }

  return (
    <div
      className={cn(
        "card-brutalist p-4",
        "border-red-500/50"
      )}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          {/* Album info */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-sm",
                failure.operation === "bulk_scan" && "bg-blue-500/20 text-blue-400",
                failure.operation === "bulk_sync_plex" && "bg-purple-500/20 text-purple-400",
                failure.operation === "bulk_sync_files" && "bg-orange-500/20 text-orange-400"
              )}
            >
              {OPERATION_LABELS[failure.operation] || failure.operation}
            </span>
            <span className="text-foreground/40 text-sm">
              {formatRelativeTime(failure.createdAt)}
            </span>
          </div>

          {/* Album title */}
          <h3 className="font-heading text-foreground truncate">
            {failure.album?.artist || "Unknown Artist"} - {failure.album?.title || "Unknown Album"}
          </h3>

          {/* Error message */}
          <p className="text-red-400 text-sm mt-1 break-words">
            {failure.error}
          </p>

          {/* Details toggle */}
          {details && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-foreground/40 text-xs mt-2 hover:text-foreground transition-colors"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          )}

          {/* Expanded details */}
          {showDetails && details && (
            <div className="mt-2 p-2 bg-background-secondary rounded-sm text-xs font-mono overflow-x-auto">
              <pre className="text-foreground/60 whitespace-pre-wrap">
                {typeof details === "string"
                  ? details
                  : JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Album link */}
        {failure.album && (
          <Link
            to={`/sync-to-files/${failure.albumId}`}
            className="text-foreground/40 hover:text-foreground transition-colors"
            title="View album"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default SyncFailuresPage;
