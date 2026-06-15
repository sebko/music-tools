const API_BASE = "/api";

async function handle(res) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || res.statusText);
  }
  return data;
}

export async function fetchSetupStatus() {
  return handle(await fetch(`${API_BASE}/setup/status`));
}

export async function markSetupComplete() {
  return handle(
    await fetch(`${API_BASE}/setup/complete`, { method: "POST" })
  );
}

export async function updateBeetsLibraryDirectory(directory) {
  return handle(
    await fetch(`${API_BASE}/beets/config/library-directory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory }),
    })
  );
}

export async function resetBeetsLibrary() {
  return handle(
    await fetch(`${API_BASE}/beets/library/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    })
  );
}

export async function startBeetsImport(path) {
  return handle(
    await fetch(`${API_BASE}/beets/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
  );
}

export async function startBeetsIdentify() {
  return handle(
    await fetch(`${API_BASE}/beets/identify`, { method: "POST" })
  );
}

export async function fetchUnprocessedFiles(path) {
  const url = new URL(`${API_BASE}/beets/unprocessed`, window.location.origin);
  url.searchParams.set("path", path);
  return handle(await fetch(url.pathname + url.search));
}

export async function deleteUnprocessedFiles(paths) {
  return handle(
    await fetch(`${API_BASE}/beets/unprocessed/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    })
  );
}

export async function runBeetsPlugin(plugin) {
  return handle(
    await fetch(`${API_BASE}/beets/plugins/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plugin }),
    })
  );
}

export async function startLibraryFinalise(phases) {
  return handle(
    await fetch(`${API_BASE}/beets/library/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phases }),
    })
  );
}

export async function fetchDuplicateGroups(folders) {
  const url = new URL(`${API_BASE}/beets/tracks/duplicates`, window.location.origin);
  if (folders && folders.length > 0) {
    url.searchParams.set("folders", folders.join(","));
  }
  return handle(await fetch(url.pathname + url.search));
}

export async function fetchLibraryFolders() {
  return handle(await fetch(`${API_BASE}/library/folders`));
}

export async function deleteDuplicateTracks(ids) {
  return handle(
    await fetch(`${API_BASE}/beets/tracks/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
  );
}
