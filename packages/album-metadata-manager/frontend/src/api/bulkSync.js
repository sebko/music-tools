import { apiJson } from "./client.js";

/**
 * Start a bulk sync operation
 * @param {Object} selectedFields - Object with field keys as keys and boolean as values
 * @returns {Promise<Object>} Response with success status
 */
export async function startBulkSync(selectedFields) {
  return apiJson("/albums/bulk-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedFields }),
  });
}

/**
 * Get the current bulk sync progress
 * @returns {Promise<Object>} Progress object with isSyncing, current, total, synced, failed, etc.
 */
export async function getBulkSyncProgress() {
  return apiJson("/albums/bulk-sync/progress");
}

/**
 * Stop the current bulk sync operation
 * @returns {Promise<Object>} Response with success status
 */
export async function stopBulkSync() {
  return apiJson("/albums/bulk-sync", { method: "DELETE" });
}
