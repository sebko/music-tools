const API_BASE = "/api";

export async function fetchInboxStatus() {
  const response = await fetch(`${API_BASE}/inbox/status`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to fetch inbox status");
  }
  return response.json();
}

export async function runInboxImport() {
  const response = await fetch(`${API_BASE}/inbox/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to start inbox import");
  }
  return response.json();
}
