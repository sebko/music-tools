const API_BASE = "/api";

/**
 * Start a bulk sync operation
 * @param {Object} selectedFields - Object with field keys as keys and boolean as values
 * @returns {Promise<Object>} Response with success status
 */
export async function startBulkSync(selectedFields) {
  const response = await fetch(`${API_BASE}/albums/bulk-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedFields }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || "Failed to start bulk sync");
  }

  return response.json();
}

/**
 * Get the current bulk sync progress
 * @returns {Promise<Object>} Progress object with isSyncing, current, total, synced, failed, etc.
 */
export async function getBulkSyncProgress() {
  const response = await fetch(`${API_BASE}/albums/bulk-sync/progress`);

  if (!response.ok) {
    throw new Error("Failed to get bulk sync progress");
  }

  return response.json();
}

/**
 * Stop the current bulk sync operation
 * @returns {Promise<Object>} Response with success status
 */
export async function stopBulkSync() {
  const response = await fetch(`${API_BASE}/albums/bulk-sync`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to stop bulk sync");
  }

  return response.json();
}
