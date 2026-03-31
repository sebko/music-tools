export async function fetchRestoreDatesPreview() {
  const response = await fetch("/api/plex/restore-dates/preview");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch preview");
  }
  return response.json();
}

export async function applyRestoreDates() {
  const response = await fetch("/api/plex/restore-dates/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to apply changes");
  }
  return response.json();
}
