const API_BASE = "/api";

/**
 * Fetch genre encoding status for a set of track IDs.
 * Returns { [trackId]: { genres: string[], correctlyFormatted: boolean, hasGenres: boolean } }
 */
export async function fetchGenreStatus(trackIds) {
  if (!trackIds || trackIds.length === 0) return {};
  const params = new URLSearchParams({ ids: trackIds.join(",") });
  const response = await fetch(`${API_BASE}/tracks/genre-status?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch genre status: ${response.statusText}`);
  }
  return response.json();
}
