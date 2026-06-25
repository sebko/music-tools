const API_BASE = "/api";

export async function startGenreTag({ query, dryRun = false } = {}) {
  const response = await fetch(`${API_BASE}/beets/genre-tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dryRun }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to start genre tagging");
  }
  return response.json();
}

export async function startWrite({ query } = {}) {
  const response = await fetch(`${API_BASE}/beets/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to start write");
  }
  return response.json();
}

export async function fetchOperation(operationId) {
  const response = await fetch(`${API_BASE}/beets/operations/${operationId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch operation status");
  }
  return response.json();
}
