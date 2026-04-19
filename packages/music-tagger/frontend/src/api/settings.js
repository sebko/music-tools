import { apiJson } from "./client.js";

export async function fetchPlexSettings() {
  return apiJson("/settings/plex");
}

export async function savePlexSettings(data) {
  return apiJson("/settings/plex", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function disconnectPlex() {
  return apiJson("/settings/plex/token", { method: "DELETE" });
}

export async function startPlexOAuth() {
  return apiJson("/settings/plex/oauth/start", { method: "POST" });
}

export async function pollPlexOAuth(id) {
  return apiJson(`/settings/plex/oauth/poll?id=${encodeURIComponent(id)}`);
}

export async function fetchPlexLibraries(serverName) {
  const params = serverName ? `?serverName=${encodeURIComponent(serverName)}` : "";
  return apiJson(`/settings/plex/libraries${params}`);
}

export async function switchActiveLibrary(activeLibraryName) {
  return apiJson("/settings/plex/active-library", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activeLibraryName }),
  });
}

export async function fetchLibrariesWithCounts() {
  return apiJson("/settings/plex/libraries-with-counts");
}
