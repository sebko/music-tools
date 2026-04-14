import { useSearchParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAlbums } from "../hooks/useAlbums";
import {
  PageLoader,
  SelectBrutalist,
  PageHeader,
  Toolbar,
  SearchInput,
  CardGrid,
  MediaCard,
  Pagination,
  EmptyState,
} from "@dj-tools/my-component-library";
import { Music, Search } from "lucide-react";

function AlbumsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const limit = parseInt(searchParams.get("limit")) || 50;
  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
  const searchQuery = searchParams.get("search") || "";

  const { data, isLoading, isError } = useAlbums(page, limit, searchQuery);

  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchSubmit = (val) => {
    const trimmed = (val || searchInput).trim();
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

  const handlePageChange = (newPage) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.page = newPage.toString();
    setSearchParams(newParams);
  };

  const handleLimitChange = (newLimit) => {
    const newParams = Object.fromEntries(searchParams.entries());
    newParams.limit = newLimit.toString();
    newParams.page = "1";
    setSearchParams(newParams);
  };

  const albums = data?.albums || [];
  const pagination = data?.pagination || {
    page: 1, limit: 50, total: 0, pages: 0, hasNext: false, hasPrev: false,
  };

  if (isLoading) {
    return <PageLoader message="Loading albums..." />;
  }

  let mainContent;
  if (isError) {
    mainContent = (
      <EmptyState
        icon={<Music className="w-16 h-16" />}
        heading="Unable to load library"
        description="There was an error loading your albums. Check that the backend is running."
      />
    );
  } else if (albums.length === 0) {
    if (searchQuery) {
      mainContent = (
        <EmptyState
          icon={<Search className="w-16 h-16" />}
          heading={`No results for "${searchQuery}"`}
          description="Try adjusting your search terms or clear the search to see all albums."
        />
      );
    } else {
      mainContent = (
        <EmptyState
          icon={<Music className="w-16 h-16" />}
          heading="No albums yet"
          description="Import music into your beets library to see albums here."
        />
      );
    }
  } else {
    mainContent = (
      <>
        <CardGrid>
          {albums.map((album) => (
            <Link
              key={album.album}
              to={`/albums/${encodeURIComponent(album.album)}`}
            >
              <MediaCard
                imageSrc={album.artworkUrl || undefined}
                imageAlt={album.album}
                title={album.album}
                subtitle={`${album.trackCount} tracks`}
              />
            </Link>
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
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={
          pagination.total === 0
            ? searchQuery
              ? `No albums found for "${searchQuery}"`
              : "No albums found"
            : searchQuery
            ? `${pagination.total} albums found for "${searchQuery}"`
            : `${pagination.total} albums`
        }
      >
        <Toolbar
          right={
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={handleSearchSubmit}
                onClear={handleClearSearch}
                placeholder="Search albums"
                className="w-48"
              />

              {pagination.total > 0 && (
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
                    onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                    options={[
                      { value: 20, label: "20" },
                      { value: 50, label: "50" },
                      { value: 100, label: "100" },
                      { value: 200, label: "200" },
                    ]}
                    className="w-20"
                  />
                </div>
              )}
            </div>
          }
        />
      </PageHeader>

      {mainContent}
    </div>
  );
}

export default AlbumsPage;
