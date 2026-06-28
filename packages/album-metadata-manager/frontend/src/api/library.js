import { apiJson } from "./client.js";

export async function startLibraryScan({ force = false } = {}) {
  return apiJson("/library/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
}

export async function stopLibraryScan() {
  return apiJson("/library/scan", { method: "DELETE" });
}

export async function fetchScanProgress() {
  return apiJson("/library/scan/progress");
}

export async function startScanAll({ force = false } = {}) {
  return apiJson("/library/scan-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
}
