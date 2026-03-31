const API_BASE = "/api";

/**
 * Start bulk sync of Plex metadata to local file tags
 * @param {Object} selectedFields - Object with field keys as keys and boolean as values
 * @param {boolean} resync - If true, re-sync already synced albums; if false, sync only unsynced
 * @returns {Promise<Object>} Response with success status
 */
export async function startBulkSyncToFiles(selectedFields, resync = false) {
  const response = await fetch(`${API_BASE}/albums/bulk-sync-to-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedFields, resync }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || "Failed to start bulk sync to files");
  }

  return response.json();
}

/**
 * Get bulk sync to files progress
 * @returns {Promise<Object>} Progress state object
 */
export async function getBulkSyncToFilesProgress() {
  const response = await fetch(`${API_BASE}/albums/bulk-sync-to-files/progress`);

  if (!response.ok) {
    throw new Error("Failed to get bulk sync to files progress");
  }

  return response.json();
}

/**
 * Stop bulk sync to files
 * @returns {Promise<Object>} Response with success status
 */
export async function stopBulkSyncToFiles() {
  const response = await fetch(`${API_BASE}/albums/bulk-sync-to-files`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to stop bulk sync to files");
  }

  return response.json();
}
