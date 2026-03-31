const API_BASE = "/api";

/**
 * Fetch file metadata (ID3/Vorbis tags) for an album
 * @param {string} albumId - The album ID (Plex rating key)
 * @returns {Promise<Object>} File metadata object
 */
export async function fetchFileMetadata(albumId) {
  const response = await fetch(`${API_BASE}/albums/${albumId}/file-metadata`);

  if (!response.ok) {
    throw new Error("Failed to fetch file metadata");
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch file metadata");
  }

  return data.metadata;
}
