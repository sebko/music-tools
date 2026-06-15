import { REDACTED } from "../../constants/metadataServices.js";
import { MetadataConfidenceCalculator } from "./confidenceCalculator.js";
import { normalizeRawQuery } from "./queryNormalizer.js";
import { RedactedRateLimiter } from "../rateLimit/redactedLimiter.js";

// Create singleton rate limiter instance
const redactedLimiter = new RedactedRateLimiter();

/**
 * Check if an album is a Various Artists album
 * @param {string} albumArtist - Album artist name
 * @returns {boolean} True if album is Various Artists
 */
function isVariousArtistsAlbum(albumArtist) {
  if (!albumArtist) return false;
  const normalized = albumArtist.toLowerCase().trim();
  return normalized === "various" ||
         normalized === "various artists" ||
         normalized === "va" ||
         normalized === "v/a" ||
         normalized === "v.a.";
}

/**
 * Detect if result is likely a Various Artists compilation
 * Uses hybrid approach: local metadata + API response signals
 * @param {string} localAlbumArtist - Local album artist name
 * @param {Object} apiResult - Formatted API result with rawResponse
 * @returns {boolean} True if likely a compilation
 */
function isLikelyCompilation(localAlbumArtist, apiResult) {
  // Signal 1: Local artist is VA
  if (isVariousArtistsAlbum(localAlbumArtist)) return true;

  // Signal 2: Many artists in Redacted response (>3 suggests compilation)
  const artistsArray = apiResult.rawResponse?.torrents?.[0]?.artists || [];
  if (artistsArray.length > 3) return true;

  // Signal 3: Release type indicates compilation
  const releaseType = apiResult.rawResponse?.releaseType;
  if (releaseType) {
    const compilationTypes = ["compilation", "anthology", "soundtrack", "dj mix"];
    if (compilationTypes.includes(releaseType.toLowerCase())) return true;
  }

  return false;
}

/**
 * Decode HTML entities in a string
 * @param {string} text - Text containing HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  if (!text) return text;

  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&aacute;": "á",
    "&eacute;": "é",
    "&iacute;": "í",
    "&oacute;": "ó",
    "&uacute;": "ú",
    "&ntilde;": "ñ",
    "&Aacute;": "Á",
    "&Eacute;": "É",
    "&Iacute;": "Í",
    "&Oacute;": "Ó",
    "&Uacute;": "Ú",
    "&Ntilde;": "Ñ",
    "&uuml;": "ü",
    "&Uuml;": "Ü",
    "&ouml;": "ö",
    "&Ouml;": "Ö",
    "&auml;": "ä",
    "&Auml;": "Ä",
    "&ccedil;": "ç",
    "&Ccedil;": "Ç",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char);
  }

  // Handle numeric entities like &#225; (á)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

  // Handle hex entities like &#xE1; (á)
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

/**
 * Build Redacted API request configuration (URL + headers)
 * Handles Cloudflare Worker routing transparently
 * @param {string} action - API action (browse, torrentgroup, artist, user_torrents)
 * @param {Object} params - Query parameters
 * @param {string} apiKey - Redacted API key
 * @param {string} domain - Redacted domain
 * @returns {{url: string, headers: Object}} Request configuration
 */
function buildRedactedRequest(action, params, apiKey, domain) {
  const useCloudflare = process.env.REDACTED_USE_CLOUDFLARE === "true";
  const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL;

  // Build query string from params
  const queryParams = new URLSearchParams({ action, ...params }).toString();

  if (useCloudflare && cloudflareWorkerUrl) {
    // Route through Cloudflare Worker
    return {
      url: `${cloudflareWorkerUrl}?${queryParams}`,
      headers: {
        Authorization: apiKey,
        "X-Redacted-Domain": domain,
        "User-Agent": "MusicTagger/2.0",
      },
    };
  } else {
    // Direct API call
    return {
      url: `https://${domain}/ajax.php?${queryParams}`,
      headers: {
        Authorization: apiKey,
        "User-Agent": "MusicTagger/2.0",
      },
    };
  }
}

/**
 * Log cache status from response headers (if using Cloudflare)
 * @param {Response} response - Fetch response object
 * @param {string} action - The API action being called (for logging)
 */
function logCacheStatus(response, action) {
  const useCloudflare = process.env.REDACTED_USE_CLOUDFLARE === "true";
  if (!useCloudflare) return;

  const cacheStatus = response.headers.get("X-Cache-Status");
  const cacheTTL = response.headers.get("X-Cache-TTL");
  if (cacheStatus) {
    console.log(`  📦 Cache: ${cacheStatus}${cacheTTL ? ` (TTL: ${cacheTTL}s)` : ""} [${action}]`);
  }
}

/**
 * Redacted API Integration (formerly Redacted)
 *
 * Full API Docs: /docs/music-tracker-api.md
 *
 * Caching & Rate Limiting:
 * - When REDACTED_USE_CLOUDFLARE=true: Cloudflare Worker handles caching + rate limiting
 * - Cache-first architecture: Cache hits bypass rate limits entirely
 * - Rate limiting: 10 requests per 10 seconds (enforced by Worker on cache misses only)
 * - Per-API-key tracking with KV Store for persistent state
 *
 * Authentication: API Key in Authorization header
 * - Header: Authorization: {api_key}
 * - Supports per-user API keys (multi-tenant)
 *
 * Key Endpoints:
 * - Search/Browse: /ajax.php?action=browse&searchstr={query}
 *   Returns: { status: 'success', response: { results: [...] } }
 *   Each result contains: groupId, groupName, artist, groupYear, tags, cover, torrents[]
 *
 * - Get Torrent Group: /ajax.php?action=torrentgroup&id={groupId}
 *   Returns: detailed torrent group info with all editions/formats
 *
 * Response Structure:
 * - groupName: Album title
 * - artist: Artist name (may be "Various Artists")
 * - groupYear: Release year
 * - tags: Array of genre tags
 * - cover: Album artwork URL
 * - torrents: Array of different releases (FLAC, MP3, etc.) with quality info
 *
 * Special Features:
 * - Returns multiple torrent editions per release (different formats/sources)
 * - Includes rip quality metadata (logScore, encoding, format)
 * - Supports "Various Artists" compilations
 *
 * Redacted API search with per-user API key support
 * @param {string} query - Search query string
 * @param {number} albumId - Album ID (unused, kept for compatibility)
 * @param {string} apiKey - User's Redacted API key (optional, falls back to env)
 * @param {string} domain - User's Redacted domain (optional, falls back to env)
 * @param {Object} localMetadata - Local album metadata for confidence calculation (optional)
 * @param {string} localMetadata.artist - Artist name
 * @param {string} localMetadata.album - Album title
 * @param {number} localMetadata.year - Release year
 * @param {boolean} normalizeQuery - Whether to normalize query (default: true)
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Object} Object with results array, normalizedQuery, originalQuery, and pagination metadata
 */
export async function searchRedacted(
  query,
  albumId,
  apiKey = null,
  domain = null,
  localMetadata = null,
  normalizeQuery = true,
  page = 1,
  advancedParams = null // Optional: { artist, album, year } for proper API param search
) {
  // Use provided API key or fall back to environment variable (support both new and legacy names)
  const userApiKey = apiKey || process.env.REDACTED_API_KEY;
  const userDomain = domain || process.env.REDACTED_DOMAIN;

  if (!userApiKey) {
    throw new Error("Redacted API key not provided");
  }

  if (!userDomain) {
    throw new Error("Redacted domain not provided");
  }

  // Build search params - use proper API params if advancedParams provided
  let searchParams;
  let actualQuery = null; // Track for return value

  if (advancedParams) {
    // Use proper API parameters (artistname, groupname, year) for better matching
    searchParams = { page };
    if (advancedParams.artist) searchParams.artistname = advancedParams.artist;
    if (advancedParams.album) searchParams.groupname = advancedParams.album;
    if (advancedParams.year) searchParams.year = advancedParams.year;

    console.log(`Redacted advanced searching (API key: ${userApiKey.substring(0, 8)}...) page ${page}`);
    console.log(`  Using API params: artistname="${advancedParams.artist || ''}", groupname="${advancedParams.album || ''}", year="${advancedParams.year || ''}"`);
  } else {
    // Legacy: use searchstr with optional normalization
    actualQuery = normalizeQuery ? normalizeRawQuery(query) || query : query;
    searchParams = { searchstr: actualQuery, page };

    console.log(`Redacted searching (API key: ${userApiKey.substring(0, 8)}...) page ${page}`);
    console.log(`  Original query: "${query}"`);
    if (normalizeQuery) {
      console.log(`  Normalized query: "${actualQuery}"`);
    } else {
      console.log(`  Exact search (normalization disabled)`);
    }
  }

  // Create the rate-limited request function
  const makeRequest = async () => {
    const { url, headers } = buildRedactedRequest(
      "browse",
      searchParams,
      userApiKey,
      userDomain
    );
    console.log(`🔍 Redacted browse search (page ${page})`);

    const searchResponse = await redactedLimiter.executeRequest(userApiKey, async () => {
      return await fetch(url, { headers });
    });
    logCacheStatus(searchResponse, "browse");

    if (!searchResponse.ok) {
      // Handle rate limit responses specifically
      if (searchResponse.status === 429) {
        console.warn(`Redacted rate limit hit for API key ${userApiKey.substring(0, 8)}...`);
        throw new Error(`Redacted API rate limit exceeded (429)`);
      }
      throw new Error(`Redacted API error: ${searchResponse.status}`);
    }

    const responseData = await searchResponse.json();
    console.log(`Redacted API response (page ${page}):`, responseData);

    if (
      !responseData.response ||
      !responseData.response.results ||
      responseData.response.results.length === 0
    ) {
      console.log(`Redacted returned no results for "${query}" (page ${page})`);
      return {
        results: [],
        normalizedQuery: normalizeQuery ? actualQuery : null,
        originalQuery: query,
        currentPage: page,
        totalPages: responseData.response?.pages || 0,
        hasMore: false,
      };
    }

    // Format results and calculate confidence if local metadata provided
    // CRITICAL: Extract artistId immediately (matches beets-redacted from_search_result factory method)
    // See: beets-redacted search.py:76-126 and types.py:213-249
    const calculator = new MetadataConfidenceCalculator();
    const results = responseData.response.results.map(result => {
      const formattedResult = {
        title: decodeHtmlEntities(result.groupName),
        artist: decodeHtmlEntities(result.artist),
        year: result.groupYear,
        genre: result.tags?.join("; ") || null,
        coverUrl: result.cover || null,
        source: REDACTED,
        groupId: result.groupId, // ← Extract groupId from browse API results
        artistId: result.torrents?.[0]?.artists?.[0]?.id || null, // ← Normalize: Extract from nested structure (browse results)
        rawResponse: result,
      };

      // Calculate confidence if local metadata is provided
      if (localMetadata) {
        const confidenceResult = calculator.calculateConfidence(localMetadata, formattedResult);
        formattedResult.confidence = confidenceResult.confidence;
        formattedResult.confidenceBreakdown = confidenceResult.breakdown;
      }

      return formattedResult;
    });

    // Sort by confidence if available (highest first)
    if (localMetadata) {
      results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      console.log(
        `Redacted found ${results.length} results on page ${page} (sorted by confidence, best: ${results[0]?.confidence}%)`
      );
    } else {
      console.log(`Redacted found ${results.length} results on page ${page}`);
    }

    const totalPages = responseData.response.pages || 1;
    const currentPage = responseData.response.currentPage || page;

    return {
      results,
      normalizedQuery: normalizeQuery ? actualQuery : null,
      originalQuery: query,
      currentPage,
      totalPages,
      hasMore: currentPage < totalPages,
    };
  };

  try {
    // Execute the request (rate limiting handled by Cloudflare Worker when enabled)
    return await makeRequest();
  } catch (error) {
    console.error("Redacted search error:", error.message);

    // Return empty results object for graceful degradation instead of throwing
    const emptyResult = {
      results: [],
      normalizedQuery: normalizeQuery ? normalizeRawQuery(query) || query : null,
      originalQuery: query,
      currentPage: page,
      totalPages: 0,
      hasMore: false,
    };

    if (error.message.includes("rate limit") || error.message.includes("429")) {
      console.warn(
        "Redacted search failed due to rate limiting (from Worker), returning empty results"
      );
      return emptyResult;
    }

    // For other errors, still return empty results but log the issue
    console.error("Redacted search failed:", error.message);
    return emptyResult;
  }
}

/**
 * Advanced Redacted search using separate artist/album/year fields
 * Combines fields into a single searchstr for better matching
 * (Redacted's artistname/groupname/year params don't work well for exact matching)
 *
 * @param {Object} params - Search parameters
 * @param {string} params.artist - Artist name
 * @param {string} params.album - Album title
 * @param {number|string} params.year - Release year (optional)
 * @param {string} apiKey - User's Redacted API key (optional, falls back to env)
 * @param {string} domain - User's Redacted domain (optional, falls back to env)
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Object} Object with results array and pagination metadata
 */
export async function searchRedactedAdvanced(
  params,
  apiKey = null,
  domain = null,
  page = 1
) {
  const userApiKey = apiKey || process.env.REDACTED_API_KEY;
  const userDomain = domain || process.env.REDACTED_DOMAIN;

  if (!userApiKey) {
    throw new Error("Redacted API key not provided");
  }

  if (!userDomain) {
    throw new Error("Redacted domain not provided");
  }

  const { artist, album, year } = params;

  // Use the API's proper filtering parameters for better matching
  // artistname, groupname, and year are separate API parameters (not just searchstr)
  const searchParams = { page };

  if (artist) searchParams.artistname = artist;
  if (album) searchParams.groupname = album;
  if (year) searchParams.year = year;

  // If neither artist nor album provided, use empty searchstr as fallback
  if (!artist && !album) {
    searchParams.searchstr = "";
  }

  console.log(`Redacted advanced search (API key: ${userApiKey.substring(0, 8)}...) page ${page}`);
  console.log(`  Search params:`, searchParams);

  // Create the rate-limited request function
  const makeRequest = async () => {
    const { url, headers } = buildRedactedRequest(
      "browse",
      searchParams,
      userApiKey,
      userDomain
    );
    console.log(`🔍 Redacted advanced browse search (page ${page})`);

    const searchResponse = await redactedLimiter.executeRequest(userApiKey, async () => {
      return await fetch(url, { headers });
    });
    logCacheStatus(searchResponse, "browse-advanced");

    if (!searchResponse.ok) {
      if (searchResponse.status === 429) {
        console.warn(`Redacted rate limit hit for API key ${userApiKey.substring(0, 8)}...`);
        throw new Error(`Redacted API rate limit exceeded (429)`);
      }
      throw new Error(`Redacted API error: ${searchResponse.status}`);
    }

    const responseData = await searchResponse.json();
    console.log(`Redacted advanced API response (page ${page}):`, responseData);

    if (
      !responseData.response ||
      !responseData.response.results ||
      responseData.response.results.length === 0
    ) {
      console.log(`Redacted advanced search returned no results (page ${page})`);
      return {
        results: [],
        currentPage: page,
        totalPages: responseData.response?.pages || 0,
        hasMore: false,
      };
    }

    // Format results
    const results = responseData.response.results.map(result => ({
      title: decodeHtmlEntities(result.groupName),
      artist: decodeHtmlEntities(result.artist),
      year: result.groupYear,
      genre: result.tags?.join("; ") || null,
      coverUrl: result.cover || null,
      source: REDACTED,
      groupId: result.groupId,
      artistId: result.torrents?.[0]?.artists?.[0]?.id || null,
      rawResponse: result,
    }));

    const totalPages = responseData.response.pages || 1;
    const currentPage = responseData.response.currentPage || page;

    console.log(`Redacted advanced search found ${results.length} results on page ${page}`);

    return {
      results,
      currentPage,
      totalPages,
      hasMore: currentPage < totalPages,
    };
  };

  try {
    return await makeRequest();
  } catch (error) {
    console.error("Redacted advanced search error:", error.message);

    return {
      results: [],
      currentPage: page,
      totalPages: 0,
      hasMore: false,
    };
  }
}

/**
 * Multi-strategy search - 1:1 implementation of beets-redacted methodology
 * Based on search.py:469-587
 *
 * TWO-STEP PROCESS (CRITICAL):
 * Step 1: Broad search to find ANY match and extract artist ID
 * Step 2: Search artist's discography for accurate match
 *
 * ONLY returns results from artist discography (Step 2), NOT from broad search (Step 1).
 * Returns ALL matches meeting minimum score threshold (sorted by confidence), or empty array if no matches found.
 *
 * @param {Object} album - Album metadata object
 * @param {string} album.albumArtist - Primary artist name
 * @param {string} album.albumArtistCredit - Artist credit name (optional)
 * @param {string} album.albumArtistSort - Sort name (optional)
 * @param {string} album.albumArtists - Array of all artists (optional)
 * @param {Array<string>} album.trackArtists - Array of unique track artists (for Various Artists albums)
 * @param {string} album.title - Album title
 * @param {string} album.titleDisambig - Disambiguated title (optional)
 * @param {number} album.year - Release year (optional)
 * @param {string} apiKey - User's Redacted API key (optional)
 * @param {string} domain - User's Redacted domain (optional)
 * @param {string} userId - User ID for snatched torrents lookup (optional)
 * @param {number} minScore - Minimum confidence score (0-1, default 0.5)
 * @returns {Array<Object>} Array of all matches meeting minScore threshold (sorted by confidence desc), or empty array if no matches
 */
export async function searchRedactedMultiStrategy(
  album,
  apiKey = null,
  domain = null,
  userId = null,
  minScore = 0.5
) {
  const userApiKey = apiKey || process.env.REDACTED_API_KEY;
  const userDomain = domain || process.env.REDACTED_DOMAIN;
  const userUserId = userId || process.env.REDACTED_USER_ID;

  if (!userApiKey) {
    throw new Error("Redacted API key not provided");
  }

  if (!userDomain) {
    throw new Error("Redacted domain not provided");
  }

  console.log(`\n=== Redacted Two-Step Search (Beets-Redacted Algorithm) ===`);
  console.log(`Album: ${album.albumArtist} - ${album.title} (${album.year || "N/A"})`);
  console.log(`Min score threshold: ${minScore * 100}%`);

  const calculator = new MetadataConfidenceCalculator();
  const preferredTorrents = [];

  // Helper function to score and return match
  const scoreMatch = (results, strategy) => {
    if (!results || results.length === 0) {
      return { match: null, score: 0 };
    }

    // Score all results
    const scoredResults = results.map(result => {
      // Check if this is likely a compilation (hybrid VA detection)
      const isCompilation = isLikelyCompilation(album.albumArtist, result);

      const confidenceResult = calculator.calculateConfidence(
        { artist: album.albumArtist, album: album.title, year: album.year },
        result,
        { skipArtistComparison: isCompilation }
      );
      return {
        ...result,
        confidence: confidenceResult.confidence / 100, // Convert to 0-1 scale
        confidenceBreakdown: confidenceResult.breakdown,
        searchStrategy: strategy,
        isCompilation, // Track for debugging
      };
    });

    // Find best match
    scoredResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return { match: scoredResults[0], score: scoredResults[0].confidence };
  };

  // STEP 1: Find best match from various strategies to extract artist ID
  // ALSO: Collect ALL scored results from Step 1 (not just best match)
  // We'll merge these with Step 2 results at the end
  let bestMatch = null;
  let bestMatchScore = 0.0;
  const step1Results = []; // Collect all scored matches from Step 1

  // Strategy 1: Check snatched torrents (if user_id configured)
  if (userUserId) {
    console.log(`\n[Step 1] Strategy: Snatched torrents`);
    try {
      const snatchedResults = await getUserSnatchedTorrents(userUserId, userApiKey, userDomain);

      // DEBUG: Check if snatched results have artistId
      if (snatchedResults.length > 0) {
        console.log(
          `  DEBUG: First 3 snatched results artistIds: ${snatchedResults
            .slice(0, 3)
            .map(r => r.artistId)
            .join(", ")}`
        );
      }

      const { match, score } = scoreMatch(snatchedResults, "snatched");

      if (match) {
        console.log(
          `  Found ${snatchedResults.length} snatched torrents, best score: ${(score * 100).toFixed(
            1
          )}%`
        );
        console.log(`  DEBUG: Snatched match artistId = ${match.artistId}`);

        // Don't fetch cover URL yet - wait until we know this is the final best match
        // Cover URL will be fetched after all Step 1 strategies complete

        // Collect ALL snatched results (not just best)
        snatchedResults.forEach(result => {
          step1Results.push({
            ...result,
            confidence: result.confidence || 0,
            source: 'snatched'
          });
        });

        if (score > bestMatchScore) {
          bestMatch = match;
          bestMatchScore = score;
        }
        // Mark as preferred for artist discography lookup
        if (match.preferred) {
          preferredTorrents.push(match);
        }
      }
    } catch (error) {
      console.warn(`  Failed: ${error.message}`);
    }
  }

  // Strategy 2-N: Try artist/album variations (lazy evaluation - stops when good match found)
  const artistVariations = [
    album.albumArtist,
    album.albumArtistCredit,
    album.albumArtistSort,
    Array.isArray(album.albumArtists) ? album.albumArtists.join(" ") : album.albumArtists,
  ].filter(Boolean);

  // For Various Artists albums, prioritize track artists (insert at beginning)
  // This is key for Various Artists compilations where the real artist is in track metadata
  if (album.trackArtists && Array.isArray(album.trackArtists) && album.trackArtists.length > 0) {
    console.log(
      `Adding ${album.trackArtists.length} track artists to search variations (prioritized)`
    );
    artistVariations.unshift(...album.trackArtists);
  }

  // Deduplicate artist variations to avoid wasting API calls
  const uniqueArtistVariations = [...new Set(artistVariations)];
  if (uniqueArtistVariations.length < artistVariations.length) {
    console.log(
      `Deduplicated ${artistVariations.length} → ${uniqueArtistVariations.length} artist variations`
    );
  }

  const albumVariations = [album.title, album.titleDisambig].filter(Boolean);

  // Deduplicate album variations
  const uniqueAlbumVariations = [...new Set(albumVariations)];

  console.log(
    `\n[Step 1] Trying ${
      uniqueArtistVariations.length * uniqueAlbumVariations.length
    } search variations (lazy evaluation)...`
  );

  let variationNum = 1;
  for (const artist of uniqueArtistVariations) {
    for (const albumTitle of uniqueAlbumVariations) {
      // Try with year first, then fallback to without year if no results
      // Use proper API params (artistname, groupname, year) instead of concatenated searchstr
      const paramsToTry = album.year
        ? [
            { artist, album: albumTitle, year: album.year },
            { artist, album: albumTitle }, // fallback without year
          ]
        : [{ artist, album: albumTitle }];

      for (const advancedParams of paramsToTry) {
        const paramDesc = `artist="${advancedParams.artist}", album="${advancedParams.album}"${advancedParams.year ? `, year=${advancedParams.year}` : ''}`;
        console.log(`  Variation ${variationNum}: ${paramDesc}`);

        try {
          // Try advanced params first (exact field matching)
          let searchResult = await searchRedacted(
            null, // query not needed when using advancedParams
            null,
            userApiKey,
            userDomain,
            { artist: album.albumArtist, album: album.title, year: album.year },
            true,
            1,
            advancedParams // Use proper API params
          );

          // Fallback: if advanced params return 0 results, try normalized searchstr
          // This handles cases like "Eleven:Eleven" vs "Eleven : Eleven" (naming variations)
          if (!searchResult.results || searchResult.results.length === 0) {
            const normalizedQuery = `${advancedParams.artist} ${advancedParams.album}`.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim();
            console.log(`    Advanced params returned 0 results, trying fallback searchstr: "${normalizedQuery}"`);

            searchResult = await searchRedacted(
              normalizedQuery,
              null,
              userApiKey,
              userDomain,
              { artist: album.albumArtist, album: album.title, year: album.year },
              true, // normalize query
              1,
              null // no advancedParams - use searchstr
            );
          }

          const { match, score } = scoreMatch(searchResult.results, `variation-${variationNum}`);

          if (match) {
            console.log(`    Score: ${(score * 100).toFixed(1)}%`);

            // Collect ALL browse results (not just best)
            searchResult.results.forEach(result => {
              step1Results.push({
                ...result,
                confidence: result.confidence || 0,
                source: `browse-variation-${variationNum}`
              });
            });

            // Only update if score is BETTER (not equal) - this prefers earlier matches (especially snatched torrents)
            // CRITICAL: When scores tie, keep the first match (snatched torrents checked first, more reliable artist IDs)
            if (score > bestMatchScore) {
              bestMatch = match;
              bestMatchScore = score;
              console.log(`    ✓ New best match`);
            } else if (score === bestMatchScore && !bestMatch.artistId && match.artistId) {
              // Special case: If scores tie, prefer the match WITH artistId over one WITHOUT
              // This handles cases where browse results tie with snatched torrents but lack artist data
              console.log(
                `    ✓ Equal score but has artistId (${match.artistId}), replacing match without artistId`
              );
              bestMatch = match;
            }
            // If we found results, don't try the fallback query (without year)
            break;
          } else {
            console.log(`    No results`);
          }
        } catch (error) {
          console.warn(`    Failed: ${error.message}`);
        }
      }

      variationNum++;
    }
  }

  // Check if we found ANY match (score threshold not applied yet)
  if (!bestMatch) {
    console.log(`\n❌ No search results found from any strategy`);
    return [];
  }

  console.log(
    `\n[Step 1] Best match: ${bestMatch.artist} - ${bestMatch.title} (score: ${(
      bestMatchScore * 100
    ).toFixed(1)}%)`
  );

  // Apply minimum score threshold for Step 1
  if (bestMatchScore < minScore) {
    console.log(
      `❌ Best match score ${(bestMatchScore * 100).toFixed(
        1
      )}% below threshold ${(minScore * 100).toFixed(1)}%`
    );
    return [];
  }

  // Fetch COMPLETE metadata from torrentgroup for the FINAL best match from Step 1
  // This ensures ALL data (artist, title, year, coverUrl, etc.) comes from the authoritative torrent group endpoint
  // This fixes inconsistencies where browse/snatched results show different artist names than the detailed view
  if (bestMatch.groupId) {
    try {
      console.log(
        `  Fetching complete metadata from torrentgroup (groupId: ${bestMatch.groupId})...`
      );
      const torrentGroup = await getTorrentGroup(bestMatch.groupId, userApiKey, userDomain);
      if (torrentGroup) {
        // Replace ALL metadata with torrent group data (single source of truth)
        bestMatch.title = torrentGroup.title;
        bestMatch.artist = torrentGroup.artist;
        bestMatch.artistId = torrentGroup.artistId; // Extract artistId from torrentgroup (fixes browse API missing artistId)
        bestMatch.year = torrentGroup.year;
        bestMatch.coverUrl = torrentGroup.coverUrl;
        bestMatch.label = torrentGroup.label;
        bestMatch.catalogNumber = torrentGroup.catalogNumber;
        bestMatch.tags = torrentGroup.tags;
        bestMatch.trackCount = torrentGroup.trackCount;
        bestMatch.trackList = torrentGroup.trackList;
        bestMatch.musicInfo = torrentGroup.musicInfo;
        bestMatch.groupId = bestMatch.groupId || torrentGroup.groupId; // ← FIX: Preserve groupId (should already exist, but set from torrentGroup as fallback)
        console.log(
          `  ✓ Updated match with torrentgroup data: ${torrentGroup.artist} - ${torrentGroup.title}`
        );
      }
    } catch (error) {
      console.warn(`  Failed to fetch torrentgroup data: ${error.message}`);
    }
  }

  // STEP 2: Extract artist ID from search result (REQUIRED for artist discography lookup)
  // This is where beets-redacted begins Step 2 of the two-step process
  //
  // CRITICAL TEST CASES (from beets-redacted test_search.py):
  // 1. Snatched torrents: artistId extracted from top level (user_torrents.artistId)
  // 2. Browse results: artistId extracted from nested structure (torrents[].artists[].id)
  // 3. Missing artist ID: should return null (fail immediately, no getTorrentGroup() fallback)
  //
  // Now we can simply read the normalized artistId field that works for BOTH sources
  let artistId = bestMatch.artistId;

  // If no artist ID found, fail immediately (matches beets-redacted behavior)
  // See: beets-redacted search.py:556-562 and test_search.py:676-702
  if (!artistId) {
    console.log(`\n❌ No artist ID found in search results (required for Step 2)`);
    console.log(
      `   This matches beets-redacted behavior: fail if browse API doesn't include artist data`
    );
    console.log(`   Search strategy: ${bestMatch.searchStrategy}`);
    console.log(
      `   Expected sources: snatched torrents (artistId) OR browse results (torrents[].artists[].id)`
    );
    console.log(`   DEBUG: bestMatch.artistId = ${bestMatch.artistId}`);
    console.log(
      `   DEBUG: bestMatch.rawResponse.torrents = ${JSON.stringify(
        bestMatch.rawResponse?.torrents?.slice(0, 1),
        null,
        2
      )}`
    );
    return [];
  }

  console.log(`\n[Step 2] Searching artist discography (artistId: ${artistId})...`);

  let artistDiscographyResults;
  try {
    artistDiscographyResults = await searchArtistDiscography(
      artistId,
      album,
      userApiKey,
      userDomain
    );
  } catch (error) {
    console.log(`❌ Artist discography lookup failed: ${error.message}`);
    return [];
  }

  if (!artistDiscographyResults || artistDiscographyResults.length === 0) {
    console.log(`❌ Artist has no albums in discography`);
    return [];
  }

  console.log(`  Found ${artistDiscographyResults.length} albums in artist discography`);

  // Match against artist's discography using artist-weighted scoring
  // Check preferred torrents first (mark them for prioritization)
  const preferredIds = new Set(preferredTorrents.map(t => t.torrentId));

  // Score all discography results and sort by confidence
  artistDiscographyResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Filter to only results meeting minimum score threshold
  const qualifyingMatches = artistDiscographyResults.filter(result => {
    const score = result.confidence / 100; // Convert to 0-1
    return score >= minScore;
  });

  if (qualifyingMatches.length === 0) {
    const bestScore = artistDiscographyResults[0]?.confidence || 0;
    console.log(
      `❌ No matches meet minimum threshold ${(minScore * 100).toFixed(1)}%`
    );
    console.log(`   Best score found: ${bestScore.toFixed(1)}%`);
    return [];
  }

  console.log(
    `  Found ${qualifyingMatches.length} matches meeting ${(minScore * 100).toFixed(1)}% threshold`
  );
  console.log(
    `  Best match: ${qualifyingMatches[0].title} (${qualifyingMatches[0].year || "N/A"}) - ${qualifyingMatches[0].confidence.toFixed(1)}%`
  );

  // Fetch COMPLETE metadata from torrentgroup for ALL qualifying matches
  // This ensures ALL data (artist, title, year, coverUrl, etc.) comes from the authoritative torrent group endpoint
  // IMPORTANT: Process sequentially to avoid rate limit bursts (not Promise.all)
  const enrichedMatches = [];
  const MAX_FETCHES = 10; // Limit how many we'll fetch to prevent excessive API usage
  const PERFECT_MATCH_THRESHOLD = 0.98; // 98% confidence = stop early

  console.log(
    `  Fetching complete metadata for up to ${Math.min(qualifyingMatches.length, MAX_FETCHES)} matches (sequential)...`
  );

  for (let i = 0; i < qualifyingMatches.length && i < MAX_FETCHES; i++) {
    const match = qualifyingMatches[i];

    if (match.groupId) {
      try {
        const torrentGroup = await getTorrentGroup(
          match.groupId,
          userApiKey,
          userDomain
        );

        if (torrentGroup) {
          // Replace ALL metadata with torrent group data (single source of truth)
          match.title = torrentGroup.title;
          match.artist = torrentGroup.artist;
          match.artistId = torrentGroup.artistId;
          match.year = torrentGroup.year;
          match.coverUrl = torrentGroup.coverUrl;
          match.label = torrentGroup.label;
          match.catalogNumber = torrentGroup.catalogNumber;
          match.tags = torrentGroup.tags;
          match.trackCount = torrentGroup.trackCount;
          match.trackList = torrentGroup.trackList;
          match.musicInfo = torrentGroup.musicInfo;
          match.groupId = match.groupId || torrentGroup.groupId; // ← FIX: Preserve groupId (should already exist, but set from torrentGroup as fallback)
        }
      } catch (error) {
        console.warn(`  Failed to fetch torrentgroup data for ${match.title}: ${error.message}`);
      }
    }

    // Mark preferred torrents
    const isPreferred = preferredIds.has(match.rawResponse?.torrentId);

    const enrichedMatch = {
      ...match,
      searchStrategy: isPreferred ? "artist-discography-preferred" : "artist-discography",
      preferred: isPreferred,
      artistId,
    };

    enrichedMatches.push(enrichedMatch);

    // Early termination: if we found a near-perfect match, stop fetching more
    if (match.confidence >= PERFECT_MATCH_THRESHOLD * 100) {
      console.log(
        `  ⚡ Found high-confidence match (${match.confidence.toFixed(1)}%), stopping early`
      );
      break;
    }
  }

  console.log(`  ✅ Enriched ${enrichedMatches.length} matches (fetched sequentially)`);

  // MERGE Step 1 and Step 2 results
  // Step 1: Browse/snatched results (may include albums not in artist discography)
  // Step 2: Artist discography results (albums from the same artist)
  console.log(`\n[Merging Results]`);
  console.log(`  Step 1 results: ${step1Results.length} matches`);
  console.log(`  Step 2 results: ${enrichedMatches.length} matches`);

  // Filter Step 1 results by minScore threshold
  const qualifyingStep1Results = step1Results.filter(result => {
    const score = result.confidence / 100; // Convert to 0-1
    return score >= minScore;
  });

  console.log(`  Step 1 after threshold: ${qualifyingStep1Results.length} matches`);

  // Merge arrays
  const allResults = [...qualifyingStep1Results, ...enrichedMatches];

  console.log(`  Combined total: ${allResults.length} matches`);

  // Deduplicate by groupId (keep highest confidence for each groupId)
  const deduped = new Map();
  allResults.forEach(result => {
    const existing = deduped.get(result.groupId);
    if (!existing || result.confidence > existing.confidence) {
      deduped.set(result.groupId, result);
    }
  });

  const mergedResults = Array.from(deduped.values());
  console.log(`  After deduplication: ${mergedResults.length} unique matches`);

  // Sort by confidence descending
  mergedResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  console.log(`\n✅ Returning ${mergedResults.length} matches`);
  mergedResults.slice(0, 3).forEach((match, i) => {
    console.log(`   ${i + 1}. ${match.artist} - ${match.title} (${match.confidence.toFixed(1)}%)`);
  });
  if (mergedResults.length > 3) {
    console.log(`   ... and ${mergedResults.length - 3} more`);
  }

  return mergedResults;
}

/**
 * Fetch user's snatched torrents from Redacted
 * Based on beets-redacted search.py:427-443
 *
 * @param {string} userId - User ID
 * @param {string} apiKey - Redacted API key
 * @param {string} domain - Redacted domain
 * @returns {Array} Array of formatted torrent results
 */
async function getUserSnatchedTorrents(userId, apiKey, domain) {
  const makeRequest = async () => {
    const { url, headers } = buildRedactedRequest(
      "user_torrents",
      { id: userId, type: "snatched", limit: 500 },
      apiKey,
      domain
    );
    console.log(`🔍 Redacted user_torrents`);

    const response = await redactedLimiter.executeRequest(apiKey, async () => {
      return await fetch(url, { headers });
    });
    logCacheStatus(response, "user_torrents");

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Redacted API rate limit exceeded (429)`);
      }
      throw new Error(`Redacted API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.response || !data.response.snatched) {
      return [];
    }

    // Format snatched torrents
    // CRITICAL: Extract artistId immediately (matches beets-redacted from_user_torrent factory method)
    // See: beets-redacted search.py:129-138 and types.py:425-433
    const formatted = data.response.snatched.map(torrent => ({
      title: decodeHtmlEntities(torrent.name),
      artist: decodeHtmlEntities(torrent.artistName),
      year: null, // User torrents don't include year
      genre: null,
      coverUrl: null,
      source: REDACTED,
      groupId: torrent.groupId,
      torrentId: torrent.torrentId,
      artistId: torrent.artistId, // ← Normalize: Extract from top level (user_torrents structure)
      rawResponse: torrent,
    }));

    // DEBUG: Log first snatched torrent to see structure
    if (formatted.length > 0) {
      console.log(`  DEBUG: First snatched torrent artistId = ${formatted[0].artistId}`);
      console.log(`  DEBUG: Raw torrent data:`, formatted[0].rawResponse);
    }

    return formatted;
  };

  return await makeRequest();
}

/**
 * Search artist's discography with refined scoring
 * Based on beets-redacted search.py:249-358
 *
 * Uses different confidence weights optimized for artist-known context:
 * - Artist: 20% (we already know the artist)
 * - Title: 70% (focus on album title match)
 * - Year: 10%
 *
 * @param {number} artistId - Redacted artist ID
 * @param {Object} album - Album metadata
 * @param {string} apiKey - Redacted API key
 * @param {string} domain - Redacted domain
 * @returns {Array} Array of formatted results from artist discography
 */
async function searchArtistDiscography(artistId, album, apiKey, domain) {
  const makeRequest = async () => {
    const { url, headers } = buildRedactedRequest("artist", { id: artistId }, apiKey, domain);
    console.log(`🔍 Redacted artist discography`);

    const response = await redactedLimiter.executeRequest(apiKey, async () => {
      return await fetch(url, { headers });
    });
    logCacheStatus(response, "artist");

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Redacted API rate limit exceeded (429)`);
      }
      throw new Error(`Redacted API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.response || !data.response.torrentgroup) {
      return [];
    }

    // Use artist-discography weights for scoring
    const calculator = MetadataConfidenceCalculator.forArtistDiscography();

    // Check if this is a Various Artists album
    // For VA albums in Step 2, we skip artist comparison since we're already searching
    // within the correct artist's discography (from Step 1's artistId)
    const isVA = isVariousArtistsAlbum(album.albumArtist);
    if (isVA) {
      console.log(`  ℹ️  Various Artists album detected - skipping artist comparison in Step 2`);
    }

    // Score each torrent group in artist's discography
    const results = [];
    console.log(
      `  🔍 DEBUG: Processing ${data.response.torrentgroup.length} albums from artist discography...`
    );
    for (const group of data.response.torrentgroup) {
      // Parse artist from the existing artists[] array (avoids additional API calls!)
      // The artist API response includes group.artists[] with the correct artist name
      const artists = group.artists || [];
      const artistNames = artists.map(a => a.name).join(", ");

      // DEBUG: Log artist data for EVERY album to see what's happening
      console.log(
        `  🐛 Album: "${group.groupName}" - artists array: [${artists
          .map(a => a?.name || "null")
          .join(", ")}] - extracted: "${artistNames}" - fallback: "${data.response.name}"`
      );

      if (group.groupName === "Campfire Songs") {
        console.log(`  🎯 FOUND CAMPFIRE SONGS!`);
      }

      const result = {
        title: decodeHtmlEntities(group.groupName),
        artist: artistNames || decodeHtmlEntities(data.response.name), // Fallback to response.name
        year: group.groupYear,
        genre: group.tags?.join("; ") || null,
        coverUrl: group.wikiImage || null,
        source: REDACTED,
        groupId: group.groupId,
        rawResponse: group,
      };

      // Calculate confidence with artist-discography weights
      // For Various Artists albums, skip artist comparison (set to 1.0) since we're already
      // in the correct artist's discography and "Various Artists" != actual artist names
      const confidenceResult = calculator.calculateConfidence(
        { artist: album.albumArtist, album: album.title, year: album.year },
        result,
        { skipArtistComparison: isVA }
      );
      result.confidence = confidenceResult.confidence;
      result.confidenceBreakdown = confidenceResult.breakdown;

      results.push(result);
    }

    return results;
  };

  return await makeRequest();
}

/**
 * Fetch detailed torrent group data from Redacted
 * @param {number} groupId - Redacted group ID
 * @param {string} apiKey - User's Redacted API key (optional, falls back to env)
 * @param {string} domain - User's Redacted domain (optional, falls back to env)
 * @returns {Object} Detailed torrent group information
 */
export async function getTorrentGroup(groupId, apiKey = null, domain = null) {
  const userApiKey = apiKey || process.env.REDACTED_API_KEY;
  const userDomain = domain || process.env.REDACTED_DOMAIN;

  if (!userApiKey) {
    throw new Error("Redacted API key not provided");
  }

  if (!userDomain) {
    throw new Error("Redacted domain not provided");
  }

  console.log(
    `Redacted fetching torrent group ${groupId} (API key: ${userApiKey.substring(0, 8)}...)`
  );

  const makeRequest = async () => {
    const { url, headers } = buildRedactedRequest(
      "torrentgroup",
      { id: groupId },
      userApiKey,
      userDomain
    );
    console.log(`🔍 Redacted torrentgroup`);

    const response = await redactedLimiter.executeRequest(userApiKey, async () => {
      return await fetch(url, { headers });
    });
    logCacheStatus(response, "torrentgroup");

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`Redacted rate limit hit for API key ${userApiKey.substring(0, 8)}...`);
        throw new Error(`Redacted API rate limit exceeded (429)`);
      }
      throw new Error(`Redacted API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Redacted torrentgroup response:", data);

    if (!data.response || !data.response.group) {
      console.log(`Redacted torrent group ${groupId} not found`);
      return null;
    }

    const group = data.response.group;
    const musicInfo = group.musicInfo || {};

    // Get torrents array first (needed for artist extraction)
    const torrents = data.response.torrents || [];

    // Use torrents[0].artists (group-level) preferentially, fallback to musicInfo.artists
    // This matches the browse API behavior which uses result.torrents[0].artists
    const artists = torrents[0]?.artists || musicInfo.artists || [];
    const artistNames = artists.map(a => a.name).join(", ") || "Unknown Artist";
    const artistId = artists.length > 0 && artists[0].id ? artists[0].id : null;

    // Parse fileList from first torrent to get track count and track names
    // fileList format: "filename{{{size}}}|||filename{{{size}}}|||..."
    let trackCount = null;
    let trackList = [];
    if (torrents.length > 0 && torrents[0].fileList) {
      const fileList = torrents[0].fileList;

      // Split by ||| and parse each file entry
      const files = fileList
        .split("|||")
        .map(entry => {
          // Extract filename from "filename{{{size}}}" format
          const match = entry.match(/^(.+?)\{\{\{(\d+)\}\}\}$/);
          if (match) {
            return {
              name: match[1],
              size: parseInt(match[2]),
            };
          }
          return null;
        })
        .filter(Boolean);

      // Filter to audio files only
      const audioExtensions = [
        ".flac",
        ".mp3",
        ".wav",
        ".m4a",
        ".ogg",
        ".opus",
        ".aac",
        ".alac",
        ".ape",
        ".wv",
      ];
      const audioFiles = files.filter(file => {
        const lowerName = file.name.toLowerCase();
        return audioExtensions.some(ext => lowerName.endsWith(ext));
      });

      trackCount = audioFiles.length;
      trackList = audioFiles.map(f => f.name).sort();

      console.log(`Parsed ${trackCount} audio tracks from fileList (total files: ${files.length})`);
    }

    return {
      id: group.id,
      groupId: group.id, // ← ADD: Return groupId for consistency with other API responses
      title: decodeHtmlEntities(group.name),
      artist: decodeHtmlEntities(artistNames),
      artistId, // Primary artist ID from musicInfo.artists[0].id
      year: group.year,
      label: decodeHtmlEntities(group.recordLabel) || null,
      catalogNumber: group.catalogueNumber || null,
      coverUrl: group.wikiImage || null,
      tags: group.tags || [],
      trackCount, // Number of audio files, null if no fileList
      trackList, // Array of track filenames, empty if no fileList
      musicInfo: {
        artists: artists,
        composers: musicInfo.composers || [],
        conductor: musicInfo.conductor || [],
        dj: musicInfo.dj || [],
        with: musicInfo.with || [], // Featured artists
        remixedBy: musicInfo.remixedBy || [],
        producer: musicInfo.producer || [],
      },
      torrents: data.response.torrents || [],
    };
  };

  try {
    return await makeRequest();
  } catch (error) {
    console.error("Redacted torrentgroup fetch error:", error.message);
    throw error;
  }
}
