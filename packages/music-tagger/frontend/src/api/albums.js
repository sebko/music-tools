const API_BASE = "/api";

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

  const response = await fetch(`${API_BASE}/albums?${params}`);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error || response.statusText;
    const error = new Error(`Failed to fetch albums: ${errorMessage}`);
    if (errorBody?.requiresSetup) {
      error.requiresSetup = true;
    }
    throw error;
  }

  return response.json();
}

export async function fetchAlbum(id) {
  const response = await fetch(`${API_BASE}/albums/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Album not found");
    }
    throw new Error(`Failed to fetch album: ${response.statusText}`);
  }

  const data = await response.json();
  return data.album; // Extract the album from the response wrapper
}

export async function refreshAlbum(id) {
  const response = await fetch(`${API_BASE}/albums/${id}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to refresh album: ${response.statusText}`
    );
  }

  return response.json();
}

// Global cache buster store - gets updated when artwork changes
const artworkCacheBusters = new Map();

export function getAlbumArtworkUrl(id) {
  // Use cache buster if available, otherwise use current timestamp
  const cacheBuster = artworkCacheBusters.get(id) || Date.now();
  return `${API_BASE}/albums/${id}/artwork?v=${cacheBuster}`;
}

export function bustArtworkCache(id) {
  // Update the cache buster for this album
  artworkCacheBusters.set(id, Date.now());
}

export async function embedAlbumArtwork(id, artworkUrl) {
  const response = await fetch(`${API_BASE}/albums/${id}/artwork/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ artworkUrl }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to embed artwork: ${response.statusText}`
    );
  }

  return response.json();
}

export async function uploadAlbumArtwork(id, file) {
  const formData = new FormData();
  formData.append("artwork", file);

  const response = await fetch(`${API_BASE}/albums/${id}/artwork/upload`, {
    method: "POST",
    body: formData,
    // Don't set Content-Type header - browser will set it with boundary
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to upload artwork: ${response.statusText}`
    );
  }

  return response.json();
}
