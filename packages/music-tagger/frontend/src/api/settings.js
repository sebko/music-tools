const API_BASE = "/api";

export async function fetchPlexSettings() {
  const response = await fetch(`${API_BASE}/settings/plex`);
  if (!response.ok) throw new Error(`Failed to fetch Plex settings: ${response.statusText}`);
  return response.json();
}

export async function savePlexSettings(data) {
  const response = await fetch(`${API_BASE}/settings/plex`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save Plex settings: ${response.statusText}`);
  }
  return response.json();
}

export async function disconnectPlex() {
  const response = await fetch(`${API_BASE}/settings/plex/token`, { method: "DELETE" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to disconnect Plex: ${response.statusText}`);
  }
  return response.json();
}

export async function startPlexOAuth() {
  const response = await fetch(`${API_BASE}/settings/plex/oauth/start`, { method: "POST" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to start Plex OAuth: ${response.statusText}`);
  }
  return response.json();
}

export async function pollPlexOAuth(id) {
  const response = await fetch(`${API_BASE}/settings/plex/oauth/poll?id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to poll Plex OAuth: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchPlexLibraries(serverName) {
  const params = serverName ? `?serverName=${encodeURIComponent(serverName)}` : "";
  const response = await fetch(`${API_BASE}/settings/plex/libraries${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch Plex libraries: ${response.statusText}`);
  }
  return response.json();
}
