/**
 * Shared utilities for sync status calculation and artwork quality checks
 * Used by SyncMetadataPage and AlbumsPage
 */

import { formatRedactedTags } from "./formatters";
import { SYNCABLE_FIELDS } from "../constants/syncableFields";

/**
 * Minimum dimension for high-resolution artwork (single source of truth)
 * Both width and height must be >= this value to qualify as HD
 */
export const HD_ARTWORK_MIN_SIZE = 1400;

/**
 * Check if artwork dimensions qualify as high-resolution
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {boolean} True if both dimensions are >= HD_ARTWORK_MIN_SIZE
 */
export function isHighResArtwork(width, height) {
  return width >= HD_ARTWORK_MIN_SIZE && height >= HD_ARTWORK_MIN_SIZE;
}

/**
 * Normalize string values for comparison
 * @param {*} value - Value to normalize
 * @returns {string} Normalized lowercase trimmed string
 */
function normalizeForComparison(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).toLowerCase().trim();
}

/**
 * Calculate sync status by comparing Plex and Redacted metadata
 * Uses SYNCABLE_FIELDS for scalability - new fields are automatically included
 *
 * @param {Object} localAlbum - Plex album data
 * @param {Object} redactedData - Redacted remote data
 * @returns {Object} { checks, syncedCount, totalFields, allSynced }
 */
export function calculateSyncStatus(localAlbum, redactedData) {
  if (!localAlbum || !redactedData) {
    return { checks: {}, syncedCount: 0, totalFields: 0, allSynced: false };
  }

  const checks = {};

  // Compare each syncable field (excluding coverUrl which can't be directly compared)
  SYNCABLE_FIELDS.forEach((field) => {
    // Skip coverUrl - artwork comparison is separate
    if (field.key === "coverUrl") return;

    switch (field.key) {
      case "title":
        checks[field.key] =
          normalizeForComparison(localAlbum.title) ===
          normalizeForComparison(redactedData.title);
        break;

      case "year":
        checks[field.key] =
          String(localAlbum.year || "") === String(redactedData.year || "");
        break;

      case "tags": {
        // Compare Plex styles with formatted Redacted tags
        const plexStyles = (localAlbum.styles || []).map((s) =>
          s.toLowerCase().trim()
        );
        const redactedTags = formatRedactedTags(redactedData.tags || []).map(
          (t) => t.toLowerCase().trim()
        );
        // Check if all Redacted tags are present in Plex (synced means Redacted values are in Plex)
        checks[field.key] =
          redactedTags.length > 0 &&
          redactedTags.every((tag) => plexStyles.includes(tag));
        break;
      }

      case "label":
        // Plex stores label as "studio" - check if Redacted label exists in Plex
        // If Redacted has no label, consider it synced (nothing to sync)
        if (!redactedData.label) {
          checks[field.key] = true;
        } else {
          // Can't directly compare - assume not synced if Redacted has a label
          // This will show as "needs sync" which is safer
          checks[field.key] = false;
        }
        break;

      default:
        // Unknown field - skip
        break;
    }
  });

  const totalFields = Object.keys(checks).length;
  const syncedCount = Object.values(checks).filter(Boolean).length;
  const allSynced = totalFields > 0 && syncedCount === totalFields;

  return { checks, syncedCount, totalFields, allSynced };
}
