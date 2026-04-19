import { apiJson } from "./client.js";

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
  return apiJson(`/sync-failures${queryString ? `?${queryString}` : ""}`);
}

/**
 * Fetch failure counts by operation type
 *
 * @returns {Promise<Object>} Response with counts object
 */
export async function fetchFailureCounts() {
  return apiJson("/sync-failures/counts");
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
  return apiJson(`/sync-failures${queryString ? `?${queryString}` : ""}`, { method: "DELETE" });
}
