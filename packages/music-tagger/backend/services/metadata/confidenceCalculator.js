import stringSimilarity from "string-similarity";

/**
 * Metadata Confidence Calculator
 *
 * Based on beets-redacted matching algorithm (matching.py:94-148):
 *
 * Default weights (initial search):
 * - Artist similarity: 50% weight
 * - Album title similarity: 40% weight
 * - Year match: 10% weight
 *
 * Artist discography weights (when artist already known):
 * - Artist similarity: 20% weight
 * - Album title similarity: 70% weight
 * - Year match: 10% weight
 *
 * Uses Dice coefficient for string similarity (via string-similarity package)
 * Returns confidence score 0-100
 */
export class MetadataConfidenceCalculator {
  constructor(weights = {}) {
    // Default weights based on beets-redacted (search.py:202)
    this.weights = {
      artist: 0.5,
      album: 0.4,
      year: 0.1,
      ...weights,
    };
  }

  /**
   * Create calculator with artist-discography weights
   * Used when matching within a known artist's discography
   * Based on search.py:286
   */
  static forArtistDiscography() {
    return new MetadataConfidenceCalculator({
      artist: 0.2,
      album: 0.7,
      year: 0.1,
    });
  }

  /**
   * Calculate confidence score between local metadata and API result
   *
   * @param {Object} localMetadata - Local album metadata
   * @param {string} localMetadata.artist - Artist name
   * @param {string} localMetadata.album - Album title
   * @param {number} localMetadata.year - Release year
   *
   * @param {Object} apiResult - API result metadata
   * @param {string} apiResult.artist - Artist name from API
   * @param {string} apiResult.title - Album title from API
   * @param {number} apiResult.year - Release year from API
   *
   * @param {Object} options - Optional configuration
   * @param {boolean} options.skipArtistComparison - If true, set artist similarity to 1.0 (for Various Artists albums in Step 2)
   *
   * @returns {Object} Confidence result
   * @returns {number} result.confidence - Overall confidence (0-100)
   * @returns {Object} result.breakdown - Breakdown by field
   */
  calculateConfidence(localMetadata, apiResult, options = {}) {
    // Normalize and calculate similarity for each field
    // For Various Artists albums in Step 2, skip artist comparison (we're already in the correct artist's discography)
    const artistSimilarity = options.skipArtistComparison
      ? 1.0
      : this._calculateStringSimilarity(localMetadata.artist, apiResult.artist);

    const albumSimilarity = this._calculateStringSimilarity(localMetadata.album, apiResult.title);

    const yearSimilarity = this._calculateYearSimilarity(localMetadata.year, apiResult.year);

    // Calculate weighted score
    const weightedScore =
      artistSimilarity * this.weights.artist +
      albumSimilarity * this.weights.album +
      yearSimilarity * this.weights.year;

    // Normalize to 0-100 scale
    const totalWeight = this.weights.artist + this.weights.album + this.weights.year;
    const confidence = (weightedScore / totalWeight) * 100;

    return {
      confidence: Math.round(confidence * 10) / 10, // Round to 1 decimal
      breakdown: {
        artist: {
          similarity: Math.round(artistSimilarity * 100),
          weight: this.weights.artist,
        },
        album: {
          similarity: Math.round(albumSimilarity * 100),
          weight: this.weights.album,
        },
        year: {
          similarity: Math.round(yearSimilarity * 100),
          weight: this.weights.year,
        },
      },
    };
  }

  /**
   * Calculate string similarity using normalization + Dice coefficient
   *
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score 0-1
   */
  _calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Normalize both strings
    const normalized1 = this._normalizeString(str1);
    const normalized2 = this._normalizeString(str2);

    // Handle empty strings after normalization
    if (!normalized1 || !normalized2) return 0;

    // Exact match after normalization
    if (normalized1 === normalized2) return 1.0;

    // Use Dice coefficient from string-similarity
    return stringSimilarity.compareTwoStrings(normalized1, normalized2);
  }

  /**
   * Calculate year similarity
   * Based on beets-redacted logic (matching.py:48-67):
   * - Missing year: 1.0 (don't penalize)
   * - Exact match: 1.0
   * - Within 1 year: 0.5
   * - Otherwise: 0.0
   *
   * @param {number} year1 - First year
   * @param {number} year2 - Second year
   * @returns {number} Similarity score 0-1
   */
  _calculateYearSimilarity(year1, year2) {
    // If either year is missing, don't penalize (beets-redacted line 59)
    if (!year1 || !year2) return 1.0;

    const yearDiff = Math.abs(year1 - year2);

    if (yearDiff === 0) return 1.0;
    if (yearDiff === 1) return 0.5;
    return 0.0;
  }

  /**
   * Normalize string for comparison
   * Based on beets-redacted normalization:
   * - Remove leading "The "
   * - Lowercase
   * - Remove special characters (keep unicode letters)
   * - Remove extra whitespace
   *
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  _normalizeString(str) {
    if (!str) return "";

    return (
      str
        // Remove leading "The "
        .replace(/^the\s+/i, "")
        // Convert to lowercase
        .toLowerCase()
        // Remove special characters (keep unicode letters, numbers, spaces)
        // Uses unicode property escape \p{L} to match any letter from any language
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        // Normalize whitespace
        .replace(/\s+/g, " ")
        .trim()
    );
  }
}
