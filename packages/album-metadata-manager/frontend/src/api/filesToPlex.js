import { apiJson } from "./client.js";

export async function fetchRestoreDatesPreview() {
  return apiJson("/plex/restore-dates/preview");
}

export async function applyRestoreDates() {
  return apiJson("/plex/restore-dates/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
