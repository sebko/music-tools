import { API_BASE, apiJson } from "./client.js";

export async function fetchAlbums({
  page = 1,
  limit = 20,
  sortBy = "addedAt",
  sortOrder = "desc",
  search = "",
  filter = "",
  fileSyncStatus = "",
  artworkQuality = "",
  syncCompleteness = "",
}) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  // Add sort parameters (pass directly to Plex API)
  params.append("sort", sortBy);
  params.append("sortDirection", sortOrder);

  // Only add search param if it's not empty
  if (search) {
    params.append("search", search);
  }

  // Only add filter param if it's not empty
  if (filter) {
    params.append("filter", filter);
  }

  // Only add fileSyncStatus param if it's not empty
  if (fileSyncStatus) {
    params.append("fileSyncStatus", fileSyncStatus);
  }

  // Only add artworkQuality param if it's not empty
  if (artworkQuality) {
    params.append("artworkQuality", artworkQuality);
  }

  // Only add syncCompleteness param if it's not empty
  if (syncCompleteness) {
    params.append("syncCompleteness", syncCompleteness);
  }

  try {
    return await apiJson(`/albums?${params}`);
  } catch (error) {
    // Preserve requiresSetup flag if present
    if (error.message.includes("requires setup")) {
      error.requiresSetup = true;
    }
    throw error;
  }
}

export async function fetchAlbum(id) {
  const data = await apiJson(`/albums/${id}`);
  return data.album;
}

export async function refreshAlbum(id) {
  return apiJson(`/albums/${id}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// Global cache buster store - gets updated when artwork changes
const artworkCacheBusters = new Map();

export function getAlbumArtworkUrl(id) {
  const cacheBuster = artworkCacheBusters.get(id) || Date.now();
  return `${API_BASE}/albums/${id}/artwork?v=${cacheBuster}`;
}

export function bustArtworkCache(id) {
  artworkCacheBusters.set(id, Date.now());
}

export async function embedAlbumArtwork(id, artworkUrl) {
  return apiJson(`/albums/${id}/artwork/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artworkUrl }),
  });
}

export async function uploadAlbumArtwork(id, file) {
  const formData = new FormData();
  formData.append("artwork", file);

  // Can't use apiJson for FormData — browser sets Content-Type with boundary
  const resp = await fetch(`${API_BASE}/albums/${id}/artwork/upload`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to upload artwork: ${resp.statusText}`
    );
  }
  return resp.json();
}
