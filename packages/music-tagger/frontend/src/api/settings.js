import { apiJson } from "./client.js";

// Current config tree: { configured, username, activeLibraryId, servers: [{ id, name,
// machineIdentifier, isEnabled, libraries: [{ id, title, sectionKey, isEnabled }] }] }
export async function fetchPlexSettings() {
  return apiJson("/settings/plex");
}

export async function disconnectPlex() {
  return apiJson("/settings/plex", { method: "DELETE" });
}

export async function startPlexOAuth() {
  return apiJson("/settings/plex/oauth/start", { method: "POST" });
}

export async function pollPlexOAuth(id) {
  return apiJson(`/settings/plex/oauth/poll?id=${encodeURIComponent(id)}`);
}

// Enable a chosen set of libraries (and their servers). Returns the updated config tree.
export async function savePlexSelection(libraryIds) {
  return apiJson("/settings/plex/selection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryIds }),
  });
}

// Enabled servers -> libraries (+ album counts) for the header switcher.
export async function fetchServers() {
  return apiJson("/servers");
}

export async function switchActiveLibrary(libraryId) {
  return apiJson("/settings/active-library", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId }),
  });
}
