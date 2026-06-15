import crypto from "crypto";

/**
 * Discogs API Integration
 *
 * API Docs: https://www.discogs.com/developers
 * Rate Limit: 60 requests/minute for authenticated requests
 *
 * Authentication Methods:
 * 1. Personal Access Token (simpler): Authorization: Discogs token={token}
 * 2. OAuth 1.0a (more complex): Requires consumer key/secret + OAuth flow
 *
 * Key Endpoints:
 * - Search: /database/search?q=...&type=release&artist=...&title=...&year=...
 *   Returns: { results: [...] } with basic release info
 *
 * - Get Release: /releases/{id}
 *   Returns: detailed release info with tracks, labels, genres, images
 *
 * - Get Release Images: Included in /releases/{id} response
 *   Images array contains URLs for cover art at various sizes
 *
 * Response Structure:
 * - Search returns: id, title, year, genre, cover_image, resource_url
 * - Detailed release includes: artists, tracklist, labels, genres, styles, images
 */

// Generate OAuth 1.0a signature for Discogs
function generateOAuthSignature(method, url, params, consumerSecret) {
  // Create parameter string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  // Create signature base string
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;

  // Create signing key (consumer secret + & + empty token secret)
  const signingKey = `${encodeURIComponent(consumerSecret)}&`;

  // Generate signature
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  return signature;
}

async function searchDiscogsDirect(albumTitle, artistName, year, returnAll = false) {
  // Check for Personal Access Token first (simpler method)
  const personalToken = process.env.DISCOGS_PERSONAL_TOKEN;
  const consumerKey = process.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = process.env.DISCOGS_CONSUMER_SECRET;

  if (!personalToken && (!consumerKey || !consumerSecret)) {
    throw new Error(
      "Either DISCOGS_PERSONAL_TOKEN or both DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET environment variables must be set"
    );
  }

  // Simple direct search query
  const query = `${albumTitle} ${artistName}`;

  console.log(`Discogs searching: ${query}`);

  const baseUrl = "https://api.discogs.com/database/search";

  // Query parameters
  const queryParams = {
    q: query,
    type: "release",
    per_page: returnAll ? "10" : "3",
  };

  // Add year if provided
  if (year) {
    queryParams.year = year.toString();
  }

  let headers = {
    "User-Agent": "MusicGenreTagger/2.0",
  };

  let url;

  if (personalToken) {
    // Use Personal Access Token (simpler method)
    queryParams.token = personalToken;
    const queryString = Object.keys(queryParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join("&");
    url = `${baseUrl}?${queryString}`;
  } else {
    // Try simple key/secret query parameter approach
    queryParams.key = consumerKey;
    queryParams.secret = consumerSecret;

    const queryString = Object.keys(queryParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join("&");
    url = `${baseUrl}?${queryString}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    console.warn(`Discogs search failed: ${response.status}`);
    return returnAll ? [] : null;
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    console.log(`Discogs search returned no results`);
    return returnAll ? [] : null;
  }

  // Process all results without confidence filtering
  const processedResults = [];

  // Get detailed info for all results (or just first for single mode)
  const resultsToProcess = returnAll ? data.results : [data.results[0]];

  for (const release of resultsToProcess) {
    // Get detailed release information
    let detailedRelease = null;
    try {
      const detailResponse = await fetch(release.resource_url, { headers });
      if (detailResponse.ok) {
        detailedRelease = await detailResponse.json();
      }
    } catch (error) {
      console.warn("Failed to fetch detailed Discogs release:", error.message);
    }

    processedResults.push({ release, detailed: detailedRelease });
  }

  if (returnAll) {
    console.log(`Discogs found ${processedResults.length} results`);
    return processedResults;
  } else {
    const firstMatch = processedResults[0];
    if (firstMatch) {
      const displayTitle = firstMatch.detailed
        ? firstMatch.detailed.title
        : firstMatch.release.title;
      const displayArtist = firstMatch.detailed
        ? firstMatch.detailed.artists?.[0]?.name
        : firstMatch.release.artist;
      console.log(`Discogs found match: "${displayTitle}" by "${displayArtist}"`);
      return firstMatch;
    }
    return null;
  }
}

async function formatDiscogsResult(release, detailed) {
  // Extract data using detailed release info if available
  let parsedAlbumTitle, parsedArtist, trackCount, genre;
  let bestArtwork = null;

  if (detailed) {
    // Extract from detailed release info
    parsedAlbumTitle = detailed.title || release.title;
    parsedArtist = detailed.artists?.[0]?.name || null;
    trackCount = detailed.tracklist?.length || null;

    // Combine genres and styles for richer genre info
    const genres = detailed.genres || [];
    const styles = detailed.styles || [];
    const allGenres = [...genres, ...styles].map(g => g.toLowerCase());
    genre = allGenres.length > 0 ? allGenres.join("; ") : null;

    // Artwork: pick highest resolution image, preferring primary/front but considering all
    if (Array.isArray(detailed.images) && detailed.images.length > 0) {
      // Sort images by total pixel count to find the largest
      const sortedBySize = detailed.images
        .filter(img => img.width && img.height)
        .sort((a, b) => b.width * b.height - a.width * a.height);

      const primary =
        detailed.images.find(img => img.type === "primary" || img.type === "front") ||
        detailed.images[0];
      const largest = sortedBySize[0];

      // Use largest if significantly bigger than primary, otherwise use primary
      const selectedImage =
        largest && primary && largest.width * largest.height > primary.width * primary.height * 1.5
          ? largest
          : primary;

      if (selectedImage && selectedImage.uri) {
        bestArtwork = {
          url: selectedImage.uri,
          width: selectedImage.width,
          height: selectedImage.height,
          mime:
            selectedImage.type && selectedImage.type.includes("jpeg") ? "image/jpeg" : undefined,
          type: "front",
        };
      }
    }
  } else {
    // Fall back to parsing search result
    parsedAlbumTitle = release.title;
    parsedArtist = release.artist || null;
    trackCount = null;
    genre = release.genre ? release.genre.map(g => g.toLowerCase()).join("; ") : null;

    // If artist is null and title contains " - ", try to split it
    if (!parsedArtist && release.title && release.title.includes(" - ")) {
      const parts = release.title.split(" - ");
      if (parts.length >= 2) {
        parsedArtist = parts[0].trim();
        parsedAlbumTitle = parts.slice(1).join(" - ").trim();
      }
    }
  }

  return {
    title: parsedAlbumTitle,
    artist: parsedArtist,
    year: release.year || null,
    trackCount: trackCount,
    genre: genre,
    source: "discogs",
    artwork: bestArtwork ? { best: bestArtwork, candidates: [bestArtwork] } : null,
  };
}

export async function searchDiscogs(albumTitle, artistName, year, options = {}) {
  try {
    const returnAll = options.returnAll || false;

    console.log(`Discogs searching for "${albumTitle}" by "${artistName}"`);

    const result = await searchDiscogsDirect(albumTitle, artistName, year, returnAll);

    if (returnAll) {
      // Format all matches
      const formattedMatches = [];
      if (result && result.length > 0) {
        for (const match of result) {
          const formattedResult = await formatDiscogsResult(match.release, match.detailed);
          formattedMatches.push(formattedResult);
        }
      }

      console.log(`Discogs found ${formattedMatches.length} matches total`);

      return {
        status: "success",
        data: formattedMatches,
        bestMatch: formattedMatches[0] || null,
        totalResults: formattedMatches.length,
      };
    } else {
      // Original behavior - return first match
      if (result) {
        const formattedResult = await formatDiscogsResult(result.release, result.detailed);

        console.log(
          `Discogs match found: "${formattedResult.title}" by "${formattedResult.artist}"`
        );

        return {
          status: "success",
          data: formattedResult,
        };
      }

      // No results found
      console.log(`Discogs found no suitable matches for "${albumTitle}" by "${artistName}"`);
      return { status: "success", data: null };
    }
  } catch (error) {
    console.error("Discogs search error:", error);
    return {
      status: "error",
      message: error.message,
    };
  }
}
