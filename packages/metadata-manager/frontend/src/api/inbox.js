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

export async function resumeInboxImport(operationId) {
  const response = await fetch(`${API_BASE}/inbox/import/${operationId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to resume inbox import");
  }
  return response.json();
}

export async function resumeInboxImportAfterDuplicateReview(operationId, decisions) {
  const response = await fetch(
    `${API_BASE}/inbox/import/${operationId}/resume-duplicates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to resume inbox import");
  }
  return response.json();
}
