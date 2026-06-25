import { apiJson } from "./client.js";
import { REDACTED } from "../constants/metadataServices";

/**
 * Search metadata for a single album (multi-strategy search)
 * @param {number} albumId - Album ID to search for
 * @param {string[]} services - Array of services (e.g. ['redacted'])
 * @param {string|null} customQuery - Optional custom search query
 * @returns {Promise<Object>} Search results
 */
export async function searchAlbumMetadata(albumId, services = [REDACTED], customQuery = null) {
  return apiJson(`/albums/${albumId}/metadata-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      services,
      query: customQuery,
    }),
  });
}

/**
 * Simple browse-only metadata search (no multi-strategy, exact query)
 * @param {number} albumId - Album ID to search for
 * @param {string} query - Exact search query
 * @param {string[]} services - Array of services (e.g. ['redacted'])
 * @returns {Promise<Object>} Search results
 */
export async function searchAlbumMetadataSimple(albumId, query, services = [REDACTED]) {
  return apiJson(`/albums/${albumId}/metadata-search/simple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      services,
      query,
    }),
  });
}

/**
 * Match an album to a metadata service's release group (no metadata
 * write yet — just records the match so a later sync can apply it).
 *
 * @param {number} albumId
 * @param {{ service: string, groupId: string|number }} payload
 * @returns {Promise<Object>}
 */
export async function matchAlbumMetadata(albumId, { service, groupId }) {
  return apiJson(`/albums/${albumId}/metadata/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, groupId }),
  });
}

/**
 * Start bulk metadata scan for albums
 * @param {number} minConfidence - Minimum confidence threshold (default: 85)
 * @param {boolean} includeMatched - Include already-matched albums (default: false)
 * @returns {Promise<Object>} Response with success message
 */
export async function startBulkMetadataScan(minConfidence = 85, includeMatched = false) {
  return apiJson("/albums/bulk-metadata-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minConfidence,
      includeMatched,
    }),
  });
}

/**
 * Get progress of current bulk metadata scan
 * @returns {Promise<Object>} Progress state
 */
export async function getBulkScanProgress() {
  return apiJson("/albums/bulk-metadata-scan/progress");
}

/**
 * Stop the current bulk metadata scan
 * @returns {Promise<Object>} Response with success message
 */
export async function stopBulkScan() {
  return apiJson("/albums/bulk-metadata-scan", { method: "DELETE" });
}
