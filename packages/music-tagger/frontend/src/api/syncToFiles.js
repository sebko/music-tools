const API_BASE = "/api";

/**
 * Sync Plex metadata to local file tags for an album
 * @param {string} albumId - Plex album ID
 * @param {Object} selectedFields - Object with field keys as keys and boolean as values
 * @returns {Promise<Object>} Response with success status and file counts
 */
export async function syncAlbumToFiles(albumId, selectedFields) {
  const response = await fetch(`${API_BASE}/albums/${albumId}/sync-to-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedFields }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || "Failed to sync metadata to files");
  }

  return response.json();
}
