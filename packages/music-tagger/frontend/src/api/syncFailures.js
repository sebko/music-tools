/**
 * Sync Failures API
 *
 * Functions for fetching and managing sync operation failures.
 */

const API_BASE = "http://localhost:3001";

/**
 * Fetch recent sync failures
 *
 * @param {Object} options - Query options
 * @param {string} [options.operation] - Filter by operation type (bulk_scan, bulk_sync_plex, bulk_sync_files)
 * @param {number} [options.limit=50] - Maximum failures to return
 * @returns {Promise<Object>} Response with failures array
 */
export async function fetchSyncFailures({ operation = null, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (operation) params.set("operation", operation);
  if (limit) params.set("limit", limit.toString());

  const queryString = params.toString();
  const url = `${API_BASE}/api/sync-failures${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch sync failures");
  }
  return response.json();
}

/**
 * Fetch failure counts by operation type
 *
 * @returns {Promise<Object>} Response with counts object
 */
export async function fetchFailureCounts() {
  const response = await fetch(`${API_BASE}/api/sync-failures/counts`);
  if (!response.ok) {
    throw new Error("Failed to fetch failure counts");
  }
  return response.json();
}

/**
 * Clear sync failures
 *
 * @param {string} [operation] - Operation type to clear, or null for all
 * @returns {Promise<Object>} Response with deleted count
 */
export async function clearSyncFailures(operation = null) {
  const params = new URLSearchParams();
  if (operation) params.set("operation", operation);

  const queryString = params.toString();
  const url = `${API_BASE}/api/sync-failures${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Failed to clear sync failures");
  }
  return response.json();
}
