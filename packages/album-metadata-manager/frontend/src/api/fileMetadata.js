import { apiJson } from "./client.js";

/**
 * Fetch file metadata (ID3/Vorbis tags) for an album
 * @param {string} albumId - The album ID (Plex rating key)
 * @returns {Promise<Object>} File metadata object
 */
export async function fetchFileMetadata(albumId) {
  const data = await apiJson(`/albums/${albumId}/file-metadata`);
  return data.metadata;
}
