import { apiJson } from "./client.js";

/**
 * Start bulk sync of Plex metadata to local file tags
 * @param {Object} selectedFields - Object with field keys as keys and boolean as values
 * @param {boolean} resync - If true, re-sync already synced albums; if false, sync only unsynced
 * @returns {Promise<Object>} Response with success status
 */
export async function startBulkSyncToFiles(selectedFields, resync = false) {
  return apiJson("/albums/bulk-sync-to-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedFields, resync }),
  });
}

/**
 * Get bulk sync to files progress
 * @returns {Promise<Object>} Progress state object
 */
export async function getBulkSyncToFilesProgress() {
  return apiJson("/albums/bulk-sync-to-files/progress");
}

/**
 * Stop bulk sync to files
 * @returns {Promise<Object>} Response with success status
 */
export async function stopBulkSyncToFiles() {
  return apiJson("/albums/bulk-sync-to-files", { method: "DELETE" });
}
