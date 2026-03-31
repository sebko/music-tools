import { MusicBrainzApi, CoverArtArchiveApi } from "musicbrainz-api";
import { getImageDimensions } from "./utils.js";

/**
 * MusicBrainz API Integration
 *
 * API Docs: https://musicbrainz.org/doc/MusicBrainz_API
 * Rate Limit: 1 request/second (enforced automatically by musicbrainz-api library)
 *
 * Key Methods:
 * - search('release', { query: { release, artist, date }, limit: N })
 *   Returns: { releases: [...], count: N }
 *
 * - lookup('release', mbid, { inc: 'artists+recordings+release-groups+genres' })
 *   Returns: detailed release object with tracks, artists, genres
 *
 * Authentication: User-Agent header only (set via appContactInfo)
 *
 * Endpoints Used:
 * - Search: /ws/2/release?query=...
 * - Lookup: /ws/2/release/{mbid}
 * - Cover Art: coverartarchive.org/release/{mbid}
 */
class MusicBrainzService {
  constructor() {
    // Initialize the MusicBrainz API client
    this.mbApi = new MusicBrainzApi({
      appName: "music-tagger",
      appVersion: "1.0.0",
      appContactInfo: process.env.MUSICBRAINZ_CONTACT_INFO || "user@example.com",
    });

    // Initialize Cover Art Archive API client
    this.coverArtApi = new CoverArtArchiveApi();
  }

  /**
   * Search for album metadata using MusicBrainz API
   * @param {string} albumTitle - Album title
   * @param {string} artistName - Artist name
   * @param {number|string} year - Release year
   * @param {boolean} returnAll - Whether to return all matches or just the best
   * @returns {Promise<Object|Array>} Search result with normalized data
   */
  async searchDirect(albumTitle, artistName, year, returnAll = false) {
    // Simple direct search using structured parameters
    const queryParams = {
      release: albumTitle,
      artist: artistName,
    };

    if (year) {
      queryParams.date = year;
    }

    console.log(`MusicBrainz searching: ${JSON.stringify(queryParams)}`);

    const searchResult = await this.mbApi.search("release", {
      query: queryParams,
      limit: returnAll ? 10 : 3,
    });

    if (!searchResult.releases || searchResult.releases.length === 0) {
      console.log(`MusicBrainz search returned no results`);
      return returnAll ? [] : null;
    }

    // Return all results without confidence filtering
    if (returnAll) {
      console.log(`MusicBrainz found ${searchResult.releases.length} results`);
      return searchResult.releases;
    } else {
      // Return first result
      const firstRelease = searchResult.releases[0];
      console.log(
        `MusicBrainz found match: "${firstRelease.title}" by "${firstRelease["artist-credit"]?.[0]?.name}"`
      );
      return firstRelease;
    }
  }

  async formatMusicBrainzResult(release) {
    // Get genre information from release-group
    const genre = await this._fetchGenreData(release);

    // Get cover art
    const artwork = await this._fetchCoverArt(release);

    // Extract return data for display
    const returnedTitle = release.title;
    const returnedArtist = release["artist-credit"] ? release["artist-credit"][0]?.name : null;
    const returnedYear = release.date ? new Date(release.date).getFullYear() : null;

    return {
      title: returnedTitle,
      artist: returnedArtist,
      year: returnedYear,
      trackCount: release["track-count"] || null,
      genre: genre,
      source: "musicbrainz",
      mbid: release.id,
      releaseGroupId: release["release-group"]?.id,
      artwork: artwork,
    };
  }

  async searchAlbum(albumTitle, artistName, year, options = {}) {
    try {
      const returnAll = options.returnAll || false;

      console.log(`MusicBrainz searching for "${albumTitle}" by "${artistName}"`);

      const result = await this.searchDirect(albumTitle, artistName, year, returnAll);

      if (returnAll) {
        // Format all matches
        const formattedMatches = [];
        if (result && result.length > 0) {
          for (const release of result) {
            const formattedResult = await this.formatMusicBrainzResult(release);
            formattedMatches.push(formattedResult);
          }
        }

        console.log(`MusicBrainz found ${formattedMatches.length} matches total`);

        return {
          status: "success",
          data: formattedMatches,
          bestMatch: formattedMatches[0] || null,
          totalResults: formattedMatches.length,
        };
      } else {
        // Original behavior - return first match
        if (result) {
          const formattedResult = await this.formatMusicBrainzResult(result);

          console.log(
            `MusicBrainz match found: "${formattedResult.title}" by "${formattedResult.artist}"`
          );

          return {
            status: "success",
            data: formattedResult,
          };
        }

        // No results found
        console.log(`MusicBrainz found no suitable matches for "${albumTitle}" by "${artistName}"`);
        return { status: "success", data: null };
      }
    } catch (error) {
      console.error("MusicBrainz search error:", error);
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  /**
   * Fetch genre data from release-group
   * @private
   */
  async _fetchGenreData(release) {
    if (!release["release-group"] || !release["release-group"].id) {
      return null;
    }

    try {
      const releaseGroupId = release["release-group"].id;
      const releaseGroup = await this.mbApi.lookup("release-group", releaseGroupId, [
        "genres",
        "tags",
      ]);

      const genres = [];

      // Collect genres (curated tags)
      if (releaseGroup.genres && releaseGroup.genres.length > 0) {
        genres.push(...releaseGroup.genres.map(g => g.name.toLowerCase()));
      }

      // Also collect top tags if no genres found
      if (genres.length === 0 && releaseGroup.tags && releaseGroup.tags.length > 0) {
        // Take top 3 tags as genre fallback
        genres.push(...releaseGroup.tags.slice(0, 3).map(t => t.name.toLowerCase()));
      }

      return genres.length > 0 ? genres.join("; ") : null;
    } catch (error) {
      console.warn("Failed to fetch genres from MusicBrainz release-group:", error.message);
      return null;
    }
  }

  /**
   * Fetch cover art from Cover Art Archive
   * @private
   */
  async _fetchCoverArt(release) {
    try {
      if (!release.id) {
        return null;
      }

      // Try to get cover art for this specific release
      let coverInfo;
      try {
        coverInfo = await this.coverArtApi.getReleaseCovers(release.id);
      } catch (releaseError) {
        // If release-specific art fails, try release-group art
        if (release["release-group"] && release["release-group"].id) {
          try {
            coverInfo = await this.coverArtApi.getReleaseGroupCovers(release["release-group"].id);
          } catch (groupError) {
            console.warn(
              "MusicBrainz Cover Art fetch failed for both release and release-group:",
              groupError.message
            );
            return null;
          }
        } else {
          console.warn("MusicBrainz Cover Art fetch failed:", releaseError.message);
          return null;
        }
      }

      // Find front cover image
      const frontImage = (coverInfo.images || []).find(img => img.front);
      if (!frontImage || !frontImage.image) {
        return null;
      }

      const bestArtwork = {
        url: frontImage.image,
        thumbnails: frontImage.thumbnails || undefined,
        width: frontImage.width ?? undefined,
        height: frontImage.height ?? undefined,
        mime: frontImage["content-type"] || undefined,
        type: "front",
      };

      // If dimensions are missing from API, fetch them manually
      if (!bestArtwork.width || !bestArtwork.height) {
        try {
          const dimensions = await getImageDimensions(frontImage.image);
          if (dimensions) {
            bestArtwork.width = dimensions.width;
            bestArtwork.height = dimensions.height;
            bestArtwork.fileSize = dimensions.fileSize;
            if (!bestArtwork.mime && dimensions.contentType) {
              bestArtwork.mime = dimensions.contentType;
            }
          }
        } catch (error) {
          console.warn("Failed to get MusicBrainz image dimensions:", error.message);
        }
      }

      return {
        best: bestArtwork,
        candidates: [bestArtwork],
      };
    } catch (error) {
      console.warn("MusicBrainz Cover Art fetch failed:", error.message);
      return null;
    }
  }

  /**
   * Lookup a specific release by MBID
   * @param {string} mbid - MusicBrainz release ID
   * @param {Array} includes - Additional data to include
   * @returns {Promise<Object>} Release data
   */
  async lookupRelease(mbid, includes = ["artists", "recordings"]) {
    try {
      const release = await this.mbApi.lookup("release", mbid, includes);
      return { status: "success", data: release };
    } catch (error) {
      console.error("MusicBrainz lookup error:", error);
      return { status: "error", message: error.message };
    }
  }

  /**
   * Lookup a specific release-group by MBID
   * @param {string} mbid - MusicBrainz release-group ID
   * @param {Array} includes - Additional data to include
   * @returns {Promise<Object>} Release-group data
   */
  async lookupReleaseGroup(mbid, includes = ["genres", "tags"]) {
    try {
      const releaseGroup = await this.mbApi.lookup("release-group", mbid, includes);
      return { status: "success", data: releaseGroup };
    } catch (error) {
      console.error("MusicBrainz release-group lookup error:", error);
      return { status: "error", message: error.message };
    }
  }
}

// Create singleton instance
const musicBrainzService = new MusicBrainzService();

export { musicBrainzService };

// Backwards compatibility - export the search function with the same signature
export async function searchMusicBrainz(albumTitle, artistName, year, options = {}) {
  return musicBrainzService.searchAlbum(albumTitle, artistName, year, options);
}
