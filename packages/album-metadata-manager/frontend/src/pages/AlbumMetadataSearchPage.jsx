import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { Button } from "@music-tools/my-component-library";
import { ArrowLeft, Search, Music } from "lucide-react";
import { METADATA_SERVICES, REDACTED } from "../constants/metadataServices";

function AlbumMetadataSearchPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: album, isLoading: albumLoading } = useAlbum(id);

  // Get selected services from navigation state or default to redacted
  const selectedServices = location.state?.services || [REDACTED];

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [normalizedQuery, setNormalizedQuery] = useState(null);
  const [showCustomSearch, setShowCustomSearch] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);

  // Custom search fields (separate artist/album/year for advanced search)
  const [customArtist, setCustomArtist] = useState("");
  const [customAlbum, setCustomAlbum] = useState("");
  const [customYear, setCustomYear] = useState("");
  const [useAdvancedSearch, setUseAdvancedSearch] = useState(true); // Default to advanced mode

  // Generate default search query when album loads and perform initial normalized search
  useEffect(() => {
    if (album && !hasSearched) {
      const defaultQuery = `${album.artist || 'Unknown Artist'} ${album.title || 'Unknown Album'}`.trim();
      setSearchQuery(defaultQuery);

      // Initialize custom search fields from album data
      setCustomArtist(album.artist || '');
      setCustomAlbum(album.title || '');
      setCustomYear(album.year ? String(album.year) : '');

      // Auto-search on page load using multi-strategy (beets-redacted algorithm)
      performSearch(defaultQuery, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album]); // Only depend on album to avoid infinite loops

  const performSearch = async (query, useSimpleSearch = false, page = 1, appendResults = false, advancedFields = null) => {
    // For advanced search, we don't need a query string
    if (!advancedFields && !query.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      // Choose endpoint based on search type
      const endpoint = useSimpleSearch
        ? `/api/albums/${id}/metadata-search/simple`
        : `/api/albums/${id}/metadata-search`;

      // Build request body based on search mode
      let requestBody;
      if (advancedFields) {
        // Advanced search with separate fields
        requestBody = {
          services: selectedServices,
          artist: advancedFields.artist || undefined,
          album: advancedFields.album || undefined,
          year: advancedFields.year || undefined,
          page: page,
        };
      } else {
        // Legacy combined query search
        requestBody = {
          services: selectedServices,
          query: query.trim(),
          normalizeQuery: !useSimpleSearch,
          page: page,
          minScore: 0  // Show ALL results for manual search (no confidence filtering)
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Search results:', data);

      // Extract normalized query from Redacted results if available
      if (data.results?.[REDACTED]?.normalizedQuery) {
        setNormalizedQuery(data.results[REDACTED].normalizedQuery);
      } else {
        setNormalizedQuery(null);
      }

      // Store pagination data from Redacted results
      if (data.results?.[REDACTED]) {
        setPaginationData({
          currentPage: data.results[REDACTED].currentPage,
          totalPages: data.results[REDACTED].totalPages,
          hasMore: data.results[REDACTED].hasMore
        });
      }

      // Either append or replace results
      if (appendResults && searchResults?.[REDACTED]?.results) {
        // Append new results to existing ones
        setSearchResults({
          ...data.results,
          [REDACTED]: {
            ...data.results[REDACTED],
            results: [
              ...searchResults[REDACTED].results,
              ...(data.results[REDACTED]?.results || [])
            ]
          }
        });
      } else {
        // Replace results (new search)
        setSearchResults(data.results || {});
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError(error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCustomSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);

    if (useAdvancedSearch) {
      // Advanced search with separate fields
      performSearch('', true, 1, false, {
        artist: customArtist.trim(),
        album: customAlbum.trim(),
        year: customYear.trim(),
      });
    } else {
      // Legacy combined query search
      performSearch(searchQuery, true, 1, false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    // Append results to existing ones
    // Use simple search if there's no normalized query (means custom search was used)
    const wasSimpleSearch = normalizedQuery === null;

    if (wasSimpleSearch && useAdvancedSearch) {
      // Continue advanced search pagination
      performSearch('', true, nextPage, true, {
        artist: customArtist.trim(),
        album: customAlbum.trim(),
        year: customYear.trim(),
      });
    } else {
      // Continue legacy search pagination
      performSearch(searchQuery, wasSimpleSearch, nextPage, true);
    }
  };

  const toggleCustomSearch = () => {
    if (!showCustomSearch && normalizedQuery) {
      // Pre-populate with normalized query when opening custom search
      setSearchQuery(normalizedQuery);
    }
    setShowCustomSearch(!showCustomSearch);
  };

  if (albumLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-foreground/60">Loading album...</div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-heading text-foreground mb-2">Album not found</h2>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Album Info */}
        <div className="mb-6">
          <h1 className="text-2xl font-heading text-foreground mb-2">
            Metadata Search
          </h1>
          <div className="text-foreground/60">
            <span className="font-medium">{album.artist || 'Unknown Artist'}</span>
            {' - '}
            <span>{album.title || 'Unknown Album'}</span>
            {album.year && <span> ({album.year})</span>}
          </div>
        </div>

        {/* Search Parameters Card - Always visible after first search */}
        {hasSearched && (
          <div className="card-brutalist p-4 mb-6">
            <h2 className="text-sm font-heading text-foreground mb-3">Search Parameters</h2>

            <div className="space-y-3 mb-4">
              {/* Artist Field */}
              <div>
                <label className="text-xs text-foreground/60 mb-1 block">Artist</label>
                <input
                  type="text"
                  value={album.artist || 'Unknown Artist'}
                  disabled
                  className="input-brutalist w-full opacity-75 cursor-not-allowed"
                />
              </div>

              {/* Album Field */}
              <div>
                <label className="text-xs text-foreground/60 mb-1 block">Album</label>
                <input
                  type="text"
                  value={album.title || 'Unknown Album'}
                  disabled
                  className="input-brutalist w-full opacity-75 cursor-not-allowed"
                />
              </div>

              {/* Year Field */}
              <div>
                <label className="text-xs text-foreground/60 mb-1 block">Year</label>
                <input
                  type="text"
                  value={album.year || 'Unknown'}
                  disabled
                  className="input-brutalist w-full opacity-75 cursor-not-allowed"
                />
              </div>

              {/* Services */}
              <div>
                <label className="text-xs text-foreground/60 mb-1 block">Services</label>
                <div className="flex gap-2">
                  {selectedServices.map(service => {
                    const serviceConfig = METADATA_SERVICES.find(s => s.value === service);
                    return (
                      <span
                        key={service}
                        className="px-2 py-1 text-xs rounded-base border bg-main text-main-foreground border-main"
                      >
                        {serviceConfig?.title || service}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Custom Search Toggle Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleCustomSearch}
            >
              <Search className="h-4 w-4" />
              {showCustomSearch ? 'Hide Custom Search' : 'Custom Search'}
            </Button>
          </div>
        )}

        {/* Custom Search Form - Collapsible */}
        {showCustomSearch && (
          <div className="card-brutalist p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-heading text-foreground">Custom Search</h2>
              <label className="flex items-center gap-2 text-xs text-foreground/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAdvancedSearch}
                  onChange={(e) => setUseAdvancedSearch(e.target.checked)}
                  className="rounded border-border"
                />
                Advanced (separate fields)
              </label>
            </div>
            <form onSubmit={handleCustomSearch} className="space-y-3">
              {useAdvancedSearch ? (
                <>
                  {/* Advanced search with separate fields */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-foreground/60 mb-1 block">Artist</label>
                      <input
                        type="text"
                        value={customArtist}
                        onChange={(e) => setCustomArtist(e.target.value)}
                        placeholder="Artist name..."
                        className="input-brutalist w-full"
                        disabled={isSearching}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-foreground/60 mb-1 block">Album</label>
                      <input
                        type="text"
                        value={customAlbum}
                        onChange={(e) => setCustomAlbum(e.target.value)}
                        placeholder="Album title..."
                        className="input-brutalist w-full"
                        disabled={isSearching}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-foreground/60 mb-1 block">Year</label>
                      <input
                        type="text"
                        value={customYear}
                        onChange={(e) => setCustomYear(e.target.value)}
                        placeholder="Year..."
                        className="input-brutalist w-full"
                        disabled={isSearching}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isDisabled={isSearching || (!customArtist.trim() && !customAlbum.trim())}
                    >
                      <Search className="h-4 w-4" />
                      {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Legacy combined query search */}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter combined search query..."
                      className="input-brutalist flex-1"
                      disabled={isSearching}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isDisabled={isSearching || !searchQuery.trim()}
                    >
                      <Search className="h-4 w-4" />
                      {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Search Results */}
      <div>
        {searchError && (
          <div className="card-brutalist border-red-500 bg-red-50 p-4 mb-6">
            <h3 className="font-heading text-red-800 mb-2">Search Error</h3>
            <p className="text-red-700">{searchError}</p>
          </div>
        )}

        {isSearching && (
          <div className="card-brutalist p-6 text-center">
            <div className="text-foreground/60">Searching metadata...</div>
          </div>
        )}

        {searchResults && !isSearching && (
          <>
            {/* Redacted Results */}
            {selectedServices.includes(REDACTED) && (
              <div className="mb-8">
                <h2 className="text-xl font-heading text-foreground mb-4 flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  Redacted Results
                  {searchResults[REDACTED]?.results && paginationData && (
                    <span className="text-sm font-normal text-foreground/60">
                      ({searchResults[REDACTED].results.length} shown
                      {paginationData.totalPages > 1 && ` • Page ${paginationData.currentPage} of ${paginationData.totalPages}`})
                    </span>
                  )}
                </h2>

                {searchResults[REDACTED]?.results && searchResults[REDACTED].results.length > 0 ? (
                  <div className="space-y-4">
                    {searchResults[REDACTED].results.map((match, index) => (
                      <div key={index} className="card-brutalist p-4">
                        <div className="flex gap-4">
                          {/* Album Artwork Thumbnail */}
                          <div className="w-16 h-16 flex-shrink-0">
                            {match.coverUrl ? (
                              <img
                                src={match.coverUrl}
                                alt={match.title || 'Unknown Title'}
                                className="w-full h-full object-cover rounded-base border border-border"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="w-full h-full bg-background-secondary rounded-base flex items-center justify-center border border-border"
                              style={{ display: match.coverUrl ? "none" : "flex" }}
                            >
                              <Music className="w-6 h-6 text-foreground/30" />
                            </div>
                          </div>

                          {/* Content and Button */}
                          <div className="flex-1 flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-heading text-foreground">
                                  {match.title || 'Unknown Title'}
                                </h3>
                                {match.confidence > 0 && (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-base border ${
                                    match.confidence >= 90 ? 'bg-green-100 text-green-800 border-green-300' :
                                    match.confidence >= 70 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                    'bg-red-100 text-red-800 border-red-300'
                                  }`}>
                                    {match.confidence}% Match
                                  </span>
                                )}
                              </div>
                              <div className="text-foreground/70 mb-2">
                                by {match.artist || 'Unknown Artist'}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-foreground/60">
                                {match.year && (
                                  <span>Year: {match.year}</span>
                                )}
                                {match.genre && (
                                  <span>Genre: {match.genre}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const groupId = match.rawResponse?.groupId;
                                if (groupId) {
                                  navigate(`/albums/${id}/match/${groupId}`);
                                } else {
                                  console.error('No groupId found for match');
                                }
                              }}
                            >
                              Match
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Load More Button */}
                    {paginationData?.hasMore && (
                      <div className="text-center mt-6">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={handleLoadMore}
                          isDisabled={isSearching}
                        >
                          {isSearching ? 'Loading...' : `Load More (Page ${paginationData.currentPage + 1} of ${paginationData.totalPages})`}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : hasSearched && (
                  <div className="card-brutalist p-6 text-center">
                    <div className="text-foreground/60">
                      No results found on Redacted
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}

        {!searchResults && !isSearching && !searchError && hasSearched && (
          <div className="card-brutalist p-6 text-center">
            <div className="text-foreground/60">
              Click "Search" to find metadata matches
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AlbumMetadataSearchPage;