/**
 * E2E test: walk through the setup wizard via the backend API.
 *
 * Flow: reset → set library path → import → skip dedup → finalise
 * (genre normaliser only) → mark complete → verify setup status.
 *
 * Run against a running backend:
 *   node tests/e2e-setup-wizard.mjs
 */

const BASE = "http://localhost:3002/api";

const LIBRARY_PATH = "/Volumes/T7/DJ Library/Singles";

// ── helpers ────────────────────────────────────────────────────────────────

async function json(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data?.error || res.statusText}`);
  }
  return data;
}

const get = (path) => json("GET", path);
const post = (path, body) => json("POST", path, body);

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function poll(operationId, { step, intervalMs = 2000, timeoutMs = 600_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const op = await get(`/beets/operations/${operationId}`);
    if (op.status === "completed") {
      log(step, `Operation completed (${op.processed ?? "?"} items)`);
      return op;
    }
    if (op.status === "failed") {
      throw new Error(`Operation failed: ${op.error}`);
    }
    const pct = op.total > 0 ? ` ${Math.round(((op.processed ?? 0) / op.total) * 100)}%` : "";
    const phase = op.phase ? ` — ${op.phase}` : "";
    log(step, `Running${phase}${pct}...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Operation timed out after ${timeoutMs / 1000}s`);
}

// ── test steps ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=== E2E Setup Wizard Test ===\n");

  // 0. Check initial status
  let status = await get("/setup/status");
  log("status", `setupComplete=${status.setupComplete}  dbExists=${status.dbExists}  libraryPath=${status.libraryPath}`);

  // 1. Reset the library DB
  log("reset", "Resetting beets library DB...");
  const reset = await post("/beets/library/reset", { confirm: true });
  assert(reset.ok, "reset should return ok");
  log("reset", `DB deleted: ${reset.dbPath}`);

  status = await get("/setup/status");
  log("status", `After reset: setupComplete=${status.setupComplete}  dbExists=${status.dbExists}`);
  assert(!status.dbExists, "db should not exist after reset");

  // 2. Set library path
  log("library", `Setting library path to ${LIBRARY_PATH}`);
  const lib = await post("/beets/config/library-directory", { directory: LIBRARY_PATH });
  assert(lib.ok, "library directory should be accepted");
  assert(lib.directory === LIBRARY_PATH, "directory should match");

  // 3. Import
  log("import", "Starting beet import...");
  const importOp = await post("/beets/import", { path: LIBRARY_PATH });
  assert(importOp.operationId, "should return operationId");
  await poll(importOp.operationId, { step: "import", intervalMs: 3000 });

  // 4. Verify DB now exists
  status = await get("/setup/status");
  log("status", `After import: setupComplete=${status.setupComplete}  dbExists=${status.dbExists}`);
  assert(status.dbExists, "db should exist after import");

  // 5. Skip duplicates (just log)
  log("duplicates", "Skipping duplicate review (same as wizard)");

  // 6. Finalise — genre normaliser only
  log("finalise", "Starting library finalise (normalizingGenres only)...");
  const finaliseOp = await post("/beets/library/process", {
    phases: ["normalizingGenres"],
  });
  assert(finaliseOp.operationId, "should return operationId");
  await poll(finaliseOp.operationId, { step: "finalise", intervalMs: 2000 });

  // 7. Mark setup complete (this is what the wizard's "Go to library" button does)
  log("complete", "Marking setup complete...");
  const complete = await post("/setup/complete");
  assert(complete.ok, "setup complete should return ok");

  // 8. Refetch status — this mirrors what React Query refetchQueries does
  status = await get("/setup/status");
  log("status", `After markSetupComplete + refetch: setupComplete=${status.setupComplete}  dbExists=${status.dbExists}`);

  // 9. Simulate SetupGate: would we redirect back to /setup or show the library?
  const gateAllows = status.setupComplete && status.dbExists;
  assert(gateAllows, "SetupGate should allow access (setupComplete=true AND dbExists=true)");
  log("gate", `SetupGate would ${gateAllows ? "ALLOW" : "BLOCK"} access to library`);

  console.log("\n=== ALL CHECKS PASSED ===");
}

main().catch((err) => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});
