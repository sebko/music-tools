import { prisma } from "../../prisma/client.js";
import { searchRedacted } from "./redacted.js";
import { REDACTED } from "../../constants/metadataServices.js";

/**
 * Core metadata scanning function - used by both individual and bulk scanning
 * @param {number} albumId - Album ID to search metadata for
 * @param {string[]} services - Array of services to search ['redacted', 'discogs']
 * @param {string|null} customQuery - Optional custom search query, otherwise generated from album
 * @param {boolean} normalizeQuery - Whether to normalize search queries (default: true)
 * @param {number} page - Page number for results (default: 1)
 * @returns {Object} Results object with service-specific results
 */
export async function scanAlbumMetadata(
  albumId,
  services = [REDACTED],
  customQuery = null,
  normalizeQuery = true,
  page = 1
) {
  try {
    // Get album data from database
    const album = await prisma.album.findUnique({
      where: { id: albumId },
    });

    if (!album) {
      throw new Error(`Album with ID ${albumId} not found`);
    }

    // Generate search query if not provided
    let searchQuery = customQuery;
    if (!searchQuery) {
      // Generate default query from album metadata
      const title = album.title || "Unknown Album";
      const artist = album.artist || "Unknown Artist";
      searchQuery = `${artist} ${title}`.trim();
    }

    console.log(`Scanning metadata for album ${albumId} with query: "${searchQuery}"`);
    console.log(`Services: ${services.join(", ")}`);

    const results = {};

    // Search each requested service
    for (const service of services) {
      try {
        if (service === REDACTED) {
          results[REDACTED] = await searchRedactedService(searchQuery, album, normalizeQuery, page);
        } else if (service === "discogs") {
          // TODO: Implement Discogs search
          console.log("Discogs search not yet implemented");
          results.discogs = [];
        } else {
          console.warn(`Unknown metadata service: ${service}`);
        }
      } catch (error) {
        console.error(`Error searching ${service}:`, error.message);
        results[service] = [];
      }
    }

    return {
      results,
      searchQuery,
      albumId,
    };
  } catch (error) {
    console.error("Error in scanAlbumMetadata:", error);
    throw error;
  }
}

/**
 * Search Redacted using existing service
 * @param {string} searchQuery - Search query string
 * @param {Object} album - Album object with metadata
 * @param {boolean} normalizeQuery - Whether to normalize the query
 * @param {number} page - Page number to fetch (default: 1)
 * @returns {Object} Object with results array, query information, and pagination metadata
 */
async function searchRedactedService(searchQuery, album, normalizeQuery = true, page = 1) {
  try {
    // Prepare local metadata for confidence calculation
    const localMetadata = {
      artist: album.artist || "Unknown Artist",
      album: album.title || "Unknown Album",
      year: album.year || null,
    };

    // Call Redacted search with local metadata for confidence scoring
    const searchResult = await searchRedacted(
      searchQuery,
      album.id,
      null, // apiKey (uses env default)
      null, // domain (uses env default)
      localMetadata, // Enable confidence calculation
      normalizeQuery, // Pass normalization flag
      page // Pass page number
    );

    if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
      console.log("No Redacted results found");
      return {
        results: [],
        normalizedQuery: searchResult?.normalizedQuery || null,
        originalQuery: searchResult?.originalQuery || searchQuery,
        currentPage: searchResult?.currentPage || page,
        totalPages: searchResult?.totalPages || 0,
        hasMore: false,
      };
    }

    console.log(
      `Found ${searchResult.results.length} Redacted results (page ${searchResult.currentPage} of ${searchResult.totalPages})`
    );
    return searchResult;
  } catch (error) {
    console.error("Error searching Redacted:", error.message);
    return {
      results: [],
      normalizedQuery: null,
      originalQuery: searchQuery,
      currentPage: page,
      totalPages: 0,
      hasMore: false,
    };
  }
}

export default scanAlbumMetadata;
