/**
 * Format a single Redacted tag for display
 * - Capitalize first letter of each word
 * - Replace dots with spaces
 *
 * @param {string} tag - Raw tag from Redacted (e.g., "trip.hop", "latin")
 * @returns {string} Formatted tag (e.g., "Trip Hop", "Latin")
 */
export function formatRedactedTag(tag) {
  if (!tag) return tag;

  // Replace dots with spaces
  const withSpaces = tag.replace(/\./g, ' ');

  // Capitalize first letter of each word
  const capitalized = withSpaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return capitalized;
}

/**
 * Format an array of Redacted tags for display
 *
 * @param {string[]} tags - Array of raw tags from Redacted
 * @returns {string[]} Array of formatted tags
 */
export function formatRedactedTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(formatRedactedTag);
}
