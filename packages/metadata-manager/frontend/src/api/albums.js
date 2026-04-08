const API_BASE = "/api";

export async function fetchAlbums({ page = 1, limit = 50, search = "" }) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (search) {
    params.append("search", search);
  }

  const response = await fetch(`${API_BASE}/albums?${params}`);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Failed to fetch albums: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchAlbumTracks(albumName) {
  const response = await fetch(`${API_BASE}/albums/${encodeURIComponent(albumName)}/tracks`);
  if (!response.ok) {
    throw new Error(`Failed to fetch album tracks: ${response.statusText}`);
  }
  return response.json();
}
