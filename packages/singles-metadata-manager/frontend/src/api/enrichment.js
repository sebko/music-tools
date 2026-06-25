const API_BASE = "/api";

export async function enrichTracks(filePaths) {
  const response = await fetch(`${API_BASE}/tracks/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: filePaths }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to enrich tracks");
  }
  return response.json();
}

export async function fetchCachedEnrichments(filePaths) {
  const params = filePaths.map((f) => encodeURIComponent(f)).join(",");
  const response = await fetch(`${API_BASE}/tracks/enrich?files=${params}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to fetch cached enrichments");
  }
  return response.json();
}

export async function fetchClaudeForTrack(operationId, filePath) {
  const response = await fetch(
    `${API_BASE}/inbox/import/${encodeURIComponent(operationId)}/claude-enrich`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to run Claude enrichment");
  }
  return response.json();
}

export async function fetchClaudeForTrackByPath(filePath) {
  const response = await fetch(`${API_BASE}/tracks/enrich/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to run Claude enrichment");
  }
  return response.json();
}

export async function applyEnrichment(filePath, fields) {
  const response = await fetch(`${API_BASE}/tracks/enrich/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, fields }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to apply enrichment");
  }
  return response.json();
}
