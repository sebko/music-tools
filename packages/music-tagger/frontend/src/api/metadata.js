import { REDACTED } from "../constants/metadataServices";

const API_BASE = "/api";

/**
 * Search metadata for a single album (multi-strategy search)
 * @param {number} albumId - Album ID to search for
 * @param {string[]} services - Array of services ['redacted', 'discogs']
 * @param {string|null} customQuery - Optional custom search query
 * @returns {Promise<Object>} Search results
 */
export async function searchAlbumMetadata(albumId, services = [REDACTED], customQuery = null) {
  const response = await fetch(`${API_BASE}/albums/${albumId}/metadata-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      services,
      query: customQuery
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error || response.statusText;
    throw new Error(`Failed to search metadata: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Simple browse-only metadata search (no multi-strategy, exact query)
 * @param {number} albumId - Album ID to search for
 * @param {string} query - Exact search query
 * @param {string[]} services - Array of services ['redacted', 'discogs']
 * @returns {Promise<Object>} Search results
 */
export async function searchAlbumMetadataSimple(albumId, query, services = [REDACTED]) {
  const response = await fetch(`${API_BASE}/albums/${albumId}/metadata-search/simple`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      services,
      query
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error || response.statusText;
    throw new Error(`Failed to search metadata: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Start bulk metadata scan for albums
 * @param {number} minConfidence - Minimum confidence threshold (default: 85)
 * @param {boolean} includeMatched - Include already-matched albums (default: false)
 * @returns {Promise<Object>} Response with success message
 */
export async function startBulkMetadataScan(minConfidence = 85, includeMatched = false) {
  const response = await fetch(`${API_BASE}/albums/bulk-metadata-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      minConfidence,
      includeMatched
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error || response.statusText;
    throw new Error(`Failed to start bulk scan: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Get progress of current bulk metadata scan
 * @returns {Promise<Object>} Progress state
 */
export async function getBulkScanProgress() {
  const response = await fetch(`${API_BASE}/albums/bulk-metadata-scan/progress`);

  if (!response.ok) {
    throw new Error(`Failed to get bulk scan progress: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Stop the current bulk metadata scan
 * @returns {Promise<Object>} Response with success message
 */
export async function stopBulkScan() {
  const response = await fetch(`${API_BASE}/albums/bulk-metadata-scan`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to stop bulk scan: ${response.statusText}`);
  }

  return response.json();
}