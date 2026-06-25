/**
 * Query Normalizer for Metadata Searches
 *
 * Based on beets-redacted normalization logic:
 * - Removes "Various Artists"
 * - Removes featuring artists
 * - Removes format/edition terms
 * - Removes parenthetical/bracketed content
 * - Removes special characters
 * - Normalizes whitespace
 *
 * This improves search accuracy by cleaning up metadata before querying APIs.
 */

// Terms to remove from queries (format-related)
const FORMAT_TERMS = [
  "cd",
  "ep",
  "lp",
  "vinyl",
  "album",
  "single",
  "deluxe",
  "remaster",
  "remastered",
  "remix",
  "remixes",
  "edition",
  "version",
  "release",
  "digital",
  "expanded",
  "anniversary",
  "special",
  "limited",
  "bonus",
  "disc",
];

// Featuring artist patterns
const FEATURING_PATTERNS = [
  /\s+ft\.?\s+/gi,
  /\s+feat\.?\s+/gi,
  /\s+featuring\s+/gi,
  /\s+with\s+/gi,
  /\s+&\s+/gi,
  /\s+and\s+/gi,
];

/**
 * Normalize a search query for better API results
 *
 * @param {string} artist - Artist name (can be null)
 * @param {string} album - Album title (can be null)
 * @returns {string|null} Normalized search query, or null if nothing remains
 */
export function normalizeSearchQuery(artist, album) {
  // Build initial query
  let query = "";

  if (artist) {
    query += artist;
  }

  if (album) {
    if (query) query += " ";
    query += album;
  }

  if (!query) return null;

  // Step 1: Remove "Various Artists" (case insensitive)
  query = query.replace(/\bvarious(\s+artists?)?\b/gi, "");

  // Step 2: Remove featuring artists
  FEATURING_PATTERNS.forEach(pattern => {
    query = query.replace(pattern, " ");
  });

  // Step 3: Remove content in parentheses and brackets
  query = query.replace(/\([^)]*\)/g, ""); // Remove (...)
  query = query.replace(/\[[^\]]*\]/g, ""); // Remove [...]

  // Step 4: Remove format/edition terms
  FORMAT_TERMS.forEach(term => {
    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    query = query.replace(pattern, "");
  });

  // Step 5: Normalize Unicode characters to ASCII equivalents
  // This converts accented characters (á, é, ñ, etc.) to their base forms (a, e, n, etc.)
  query = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Step 6: Remove special characters (keep only alphanumeric and spaces)
  query = query.replace(/[^a-z0-9\s]/gi, "");

  // Step 7: Normalize whitespace
  query = query.replace(/\s+/g, " ").trim();

  // Return null if nothing remains after normalization
  return query || null;
}

/**
 * Normalize a raw query string (when artist/album aren't separated)
 *
 * @param {string} rawQuery - Raw search string
 * @returns {string|null} Normalized search query, or null if nothing remains
 */
export function normalizeRawQuery(rawQuery) {
  if (!rawQuery) return null;

  // Apply same normalization steps
  let query = rawQuery;

  // Remove "Various Artists"
  query = query.replace(/\bvarious(\s+artists?)?\b/gi, "");

  // Remove featuring artists
  FEATURING_PATTERNS.forEach(pattern => {
    query = query.replace(pattern, " ");
  });

  // Remove content in parentheses and brackets
  query = query.replace(/\([^)]*\)/g, "");
  query = query.replace(/\[[^\]]*\]/g, "");

  // Remove format/edition terms
  FORMAT_TERMS.forEach(term => {
    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    query = query.replace(pattern, "");
  });

  // Normalize Unicode characters to ASCII equivalents
  // This converts accented characters (á, é, ñ, etc.) to their base forms (a, e, n, etc.)
  query = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Remove special characters
  query = query.replace(/[^a-z0-9\s]/gi, "");

  // Normalize whitespace
  query = query.replace(/\s+/g, " ").trim();

  return query || null;
}
