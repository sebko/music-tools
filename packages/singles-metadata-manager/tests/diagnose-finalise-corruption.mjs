#!/usr/bin/env node
// Isolates which finalise phase is corrupting FLAC audio frames.
// Runs each phase from libraryProcessingPipeline against a fresh sandbox copy
// of each known-good backup file, then reports a matrix of flac -t results.
//
// Sandbox: /tmp/flac-diagnosis/. Never touches T7 library or real beets DB.

import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, rmSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { normalizeGenresInFolders } from "../backend/services/genreNormalizer.js";
import {
  SINGLES_VENV_PY,
  TAG_SCRIPT,
  ART_SCRIPT,
  spawnStream,
} from "../backend/services/beetsPipelineHelpers.js";

const MODE = process.argv[2] || "per-phase"; // "per-phase" | "full-chain"

const execFileAsync = promisify(execFile);

const BEET_BIN = join(homedir(), ".local", "bin", "beet");
const SANDBOX = "/tmp/flac-diagnosis";
const SANDBOX_LIB = join(SANDBOX, "lib");
const SANDBOX_BEETS = join(SANDBOX, "beets");
const SANDBOX_CFG = join(SANDBOX_BEETS, "config.yaml");
const SANDBOX_DB = join(SANDBOX_BEETS, "library.db");
const SANDBOX_YEAR = join(SANDBOX_LIB, "2026");
const SANDBOX_MONTH = join(SANDBOX_YEAR, "2026-03 March");

const BACKUP_DIR = "/Volumes/T7/Backup/Singles/2026/2026-03 March";

// The 4 files broken live but clean in backup (identified forensically).
const SUBJECTS = [
  "02 Promoting Violence.flac",
  "04 Huayño \u201CPhuju\u201D.flac", // curly quotes as in filesystem
  "10. hard 2 kill VOL 2.flac",
  "Isidro Cuevas & Willy Cabañas - Perderme en tus ojos.flac",
];

const PHASES = [
  "checking",
  "setAlbumTags",
  "scrubbing",
  "normalizingGenres",
  "artwork",
  "ftintitle",
  "replaygain",
];

const BEETS_CONFIG_YAML = `plugins: fetchart duplicates scrub edit badfiles ftintitle replaygain
directory: ${SANDBOX_LIB}
library: ${SANDBOX_DB}
import:
  move: false
  copy: false
  write: true
  incremental: false
  quiet_fallback: asis
  timid: false
  quiet: true
  singletons: true
  duplicate_action: keep
  autotag: 'no'
paths:
  default: $albumartist/$album%aunique{}/$track $title
  singleton: Singles/$artist - $title
  comp: Compilations/$album%aunique{}/$track $title
scrub:
  auto: false
ftintitle:
  auto: false
  drop: false
  format: feat. {0}
replaygain:
  backend: ffmpeg
  auto: false
  overwrite: false
  targetlevel: 89
`;

function resetSandbox() {
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX_MONTH, { recursive: true });
  mkdirSync(SANDBOX_BEETS, { recursive: true });
  writeFileSync(SANDBOX_CFG, BEETS_CONFIG_YAML);
}

function copySubject(name) {
  const src = join(BACKUP_DIR, name);
  const dst = join(SANDBOX_MONTH, name);
  if (!existsSync(src)) throw new Error(`backup missing: ${src}`);
  copyFileSync(src, dst);
  return dst;
}

function flacTest(file) {
  const r = spawnSync("flac", ["-t", "-s", file], { encoding: "utf8" });
  return {
    ok: r.status === 0,
    stderr: (r.stderr || "").split("\n").filter(Boolean).slice(-3).join(" | "),
  };
}

function metaflacBlocks(file) {
  const r = spawnSync("metaflac", ["--list", file], { encoding: "utf8" });
  if (r.status !== 0) return [`list-failed: ${(r.stderr || "").trim().slice(0, 120)}`];
  const blocks = [];
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^\s+type:\s+(\d+)\s+\(([^)]+)\)/);
    if (m) blocks.push({ type: Number(m[1]), name: m[2], length: null });
    const lm = line.match(/^\s+length:\s+(\d+)/);
    if (lm && blocks.length) {
      const last = blocks[blocks.length - 1];
      if (last.length == null) last.length = Number(lm[1]);
    }
  }
  return blocks.map((b) => `${b.name}(${b.type})/${b.length}`);
}

async function beet(args) {
  return execFileAsync(BEET_BIN, ["-c", SANDBOX_CFG, ...args], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 600000,
  }).catch((err) => ({ stdout: err.stdout || "", stderr: err.stderr || err.message, code: err.code ?? 1 }));
}

async function sandboxImport() {
  const r = await beet(["import", "-s", "-A", SANDBOX_MONTH]);
  if (r.code && r.code !== 0) {
    throw new Error(`sandbox beet import failed: ${(r.stderr || "").slice(0, 400)}`);
  }
}

async function runPhase(phase, filePath) {
  const monthFolder = SANDBOX_MONTH;
  const yearFolder = SANDBOX_YEAR;

  if (phase === "checking") {
    await beet(["bad", `path:${monthFolder}`]);
    return;
  }
  if (phase === "setAlbumTags") {
    const r = await spawnStream(SINGLES_VENV_PY, [TAG_SCRIPT, yearFolder], () => {});
    if (r.code !== 0) throw new Error(`set_album_tags.py exit ${r.code}: ${r.stderr.slice(0, 200)}`);
    return;
  }
  if (phase === "scrubbing") {
    await beet(["update", `path:${monthFolder}`]);
    await beet(["scrub", `path:${monthFolder}`]);
    return;
  }
  if (phase === "normalizingGenres") {
    await normalizeGenresInFolders([monthFolder]);
    return;
  }
  if (phase === "artwork") {
    const r = await spawnStream(SINGLES_VENV_PY, [ART_SCRIPT, yearFolder], () => {});
    if (r.code !== 0) throw new Error(`generate_album_art.py exit ${r.code}: ${r.stderr.slice(0, 200)}`);
    return;
  }
  if (phase === "ftintitle") {
    await beet(["ftintitle", `path:${monthFolder}`]);
    return;
  }
  if (phase === "replaygain") {
    await beet(["replaygain", `path:${monthFolder}`]);
    return;
  }
  throw new Error(`unknown phase: ${phase}`);
}

async function runFullChain() {
  // Mirrors libraryProcessingPipeline.runProcessingPhases order on all 4
  // subjects dropped into ONE sandbox month folder, so we can see whether
  // the damage needs cross-file interaction or cross-phase interaction.
  resetSandbox();
  for (const s of SUBJECTS) copySubject(s);

  console.log("[chain] baseline flac -t results:");
  const baselineOk = [];
  for (const s of SUBJECTS) {
    const r = flacTest(join(SANDBOX_MONTH, s));
    console.log(`  ${r.ok ? "ok" : "FAIL"}  ${s}`);
    if (r.ok) baselineOk.push(s);
  }
  if (baselineOk.length === 0) throw new Error("no clean baseline subjects — abort");

  await sandboxImport();
  const chain = [
    "checking",
    "setAlbumTags",
    "scrubbing",
    "normalizingGenres",
    "artwork",
    "ftintitle",
    "replaygain",
  ];

  // After every phase, flac -t all subjects and log the first transition ok->FAIL.
  const brokenAt = new Map();
  for (const phase of chain) {
    console.log(`\n[chain] running ${phase}...`);
    try {
      await runPhase(phase, null);
    } catch (err) {
      console.log(`  phase error: ${err.message.slice(0, 200)}`);
    }
    for (const s of baselineOk) {
      if (brokenAt.has(s)) continue;
      const f = join(SANDBOX_MONTH, s);
      const r = flacTest(f);
      if (!r.ok) {
        const blocks = metaflacBlocks(f).join(",");
        brokenAt.set(s, { phase, stderr: r.stderr, blocks });
        console.log(`  !! BROKEN after ${phase}: ${s}`);
        console.log(`     stderr: ${r.stderr.slice(0, 160)}`);
        console.log(`     blocks: ${blocks.slice(0, 240)}`);
      }
    }
  }

  console.log("\n===== CHAIN RESULT =====");
  for (const s of baselineOk) {
    const entry = brokenAt.get(s);
    if (entry) {
      console.log(`BROKEN at [${entry.phase}]  ${s}`);
    } else {
      console.log(`ok              ${s}`);
    }
  }
}

async function main() {
  // Sanity: binaries + venv + backup dir.
  for (const bin of ["flac", "metaflac", "ffmpeg"]) {
    const r = spawnSync("/usr/bin/env", ["which", bin], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`missing binary on PATH: ${bin}`);
  }
  if (!existsSync(BEET_BIN)) throw new Error(`beet not at ${BEET_BIN}`);
  if (!existsSync(SINGLES_VENV_PY)) throw new Error(`singles venv missing: ${SINGLES_VENV_PY}`);
  if (!existsSync(BACKUP_DIR)) throw new Error(`backup dir missing: ${BACKUP_DIR}`);

  if (MODE === "full-chain") {
    await runFullChain();
    return;
  }

  const rows = [];
  for (const subject of SUBJECTS) {
    for (const phase of PHASES) {
      resetSandbox();
      const file = copySubject(subject);
      const baseline = flacTest(file);
      if (!baseline.ok) {
        rows.push({ subject, phase, baseline: "FAIL", after: "skip", blocks: "-" });
        continue;
      }

      let phaseErr = null;
      try {
        await sandboxImport();
        await runPhase(phase, file);
      } catch (err) {
        phaseErr = err.message;
      }

      const after = flacTest(file);
      const blocks = metaflacBlocks(file).join(",");
      rows.push({
        subject,
        phase,
        baseline: "ok",
        after: after.ok ? "ok" : `FAIL(${after.stderr.slice(0, 60)})`,
        blocks: blocks.slice(0, 160),
        phaseErr,
      });

      const marker = after.ok ? "  " : "!!";
      console.log(
        `${marker} ${phase.padEnd(18)} ${subject.slice(0, 40).padEnd(40)}  ${
          after.ok ? "ok" : "BROKEN"
        }${phaseErr ? `  [phase err: ${phaseErr.slice(0, 80)}]` : ""}`,
      );
    }
  }

  console.log("\n===== MATRIX =====");
  const cols = PHASES.map((p) => p.slice(0, 4).padEnd(5)).join(" ");
  console.log(`${"file".padEnd(42)}  ${cols}`);
  for (const subject of SUBJECTS) {
    const label = subject.slice(0, 40).padEnd(42);
    const cells = PHASES.map((p) => {
      const row = rows.find((r) => r.subject === subject && r.phase === p);
      if (!row) return "  -  ";
      if (row.baseline === "FAIL") return "  b  ";
      return row.after === "ok" ? "  .  " : "  X  ";
    }).join(" ");
    console.log(`${label}  ${cells}`);
  }
  console.log("\nlegend: . = ok, X = corrupted, b = baseline already bad");

  console.log("\n===== CORRUPTION DETAIL =====");
  for (const row of rows) {
    if (row.after !== "ok" && row.baseline === "ok") {
      console.log(`\n[${row.phase}] ${row.subject}`);
      console.log(`  after: ${row.after}`);
      console.log(`  blocks: ${row.blocks}`);
      if (row.phaseErr) console.log(`  phase err: ${row.phaseErr}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
