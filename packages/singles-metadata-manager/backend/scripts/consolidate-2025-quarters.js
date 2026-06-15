#!/usr/bin/env node
/*
 * One-off rollup: move every file under Singles/2025/2025-MM * into
 * Singles/2025/2025-Qn, retag + re-embed artwork, sync beets DB.
 *
 *   node backend/scripts/consolidate-2025-quarters.js          # dry-run
 *   node backend/scripts/consolidate-2025-quarters.js --apply  # execute
 */
import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  copyFileSync,
  unlinkSync,
  rmdirSync,
  statSync,
} from "fs";
import { dirname, join, basename, extname, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { getBeetsLibraryDbPath } from "../services/beetsConfig.js";
import { runBeetStreaming } from "../services/beetsRunner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SINGLES_DIR = resolvePath(__dirname, "..", "..", "..", "singles-metadata-manager");
const SINGLES_VENV_PY = join(SINGLES_DIR, ".venv", "bin", "python");
const TAG_SCRIPT = join(SINGLES_DIR, "scripts", "set_album_tags.py");
const ART_SCRIPT = join(SINGLES_DIR, "scripts", "generate_album_art.py");

const LIBRARY_ROOT = "/Volumes/T7/DJ Library/Singles";
const YEAR = "2025";

const QUARTER_MAP = {
  "2025-01 January": "2025-Q1",
  "2025-03 March": "2025-Q1",
  "2025-05 May": "2025-Q2",
  "2025-06 June": "2025-Q2",
  "2025-07 July": "2025-Q3",
  "2025-08 August": "2025-Q3",
  "2025-09 September": "2025-Q3",
  "2025-12 December": "2025-Q4",
};

const APPLY = process.argv.includes("--apply");

function log(...args) {
  console.log(...args);
}

function pickUniqueDest(destDir, name) {
  let candidate = join(destDir, name);
  if (!existsSync(candidate)) return candidate;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let n = 2;
  while (existsSync(join(destDir, `${stem} (${n})${ext}`))) n += 1;
  return join(destDir, `${stem} (${n})${ext}`);
}

function moveFile(src, dest) {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    copyFileSync(src, dest);
    unlinkSync(src);
  }
}

function spawnStream(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

async function main() {
  const yearRoot = join(LIBRARY_ROOT, YEAR);
  if (!existsSync(yearRoot)) {
    console.error(`Year folder not found: ${yearRoot}`);
    process.exit(1);
  }

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  log(`Year root: ${yearRoot}`);
  log("");

  const plannedMoves = [];
  const touchedQuarters = new Set();
  const emptiedMonths = [];

  for (const [monthName, quarterName] of Object.entries(QUARTER_MAP)) {
    const monthPath = join(yearRoot, monthName);
    if (!existsSync(monthPath)) {
      log(`  [skip] ${monthName} — not present`);
      continue;
    }
    const quarterPath = join(yearRoot, quarterName);
    const entries = readdirSync(monthPath);
    const files = entries.filter((e) => {
      const p = join(monthPath, e);
      return statSync(p).isFile() && !e.startsWith(".");
    });

    if (files.length === 0) {
      log(`  [empty] ${monthName} — will delete`);
      emptiedMonths.push(monthPath);
      continue;
    }

    touchedQuarters.add(quarterPath);
    emptiedMonths.push(monthPath);

    log(`  ${monthName} -> ${quarterName} (${files.length} files)`);
    for (const f of files) {
      const src = join(monthPath, f);
      plannedMoves.push({ src, quarterPath, filename: f });
    }
  }

  log("");
  log(`Total files to move: ${plannedMoves.length}`);
  log(`Quarter folders touched: ${[...touchedQuarters].map((q) => basename(q)).join(", ")}`);
  log(`Month folders to remove: ${emptiedMonths.map((m) => basename(m)).join(", ")}`);
  log("");

  if (!APPLY) {
    log("Dry-run complete. Re-run with --apply to execute.");
    return;
  }

  // ---------- Phase 1: create quarter dirs + move files ----------
  log("Phase 1: moving files...");
  for (const quarterPath of touchedQuarters) {
    mkdirSync(quarterPath, { recursive: true });
  }

  const executedMoves = []; // { oldPath, newPath }
  for (const { src, quarterPath, filename } of plannedMoves) {
    const dest = pickUniqueDest(quarterPath, filename);
    moveFile(src, dest);
    executedMoves.push({ oldPath: src, newPath: dest });
    log(`  moved: ${filename} -> ${basename(quarterPath)}/${basename(dest)}`);
  }

  // ---------- Phase 2: delete empty month folders ----------
  log("");
  log("Phase 2: removing empty month folders...");
  for (const monthPath of emptiedMonths) {
    const remaining = readdirSync(monthPath).filter((e) => !e.startsWith("."));
    if (remaining.length > 0) {
      console.error(`  REFUSED: ${basename(monthPath)} still has entries: ${remaining.join(", ")}`);
      continue;
    }
    rmdirSync(monthPath);
    log(`  removed: ${basename(monthPath)}`);
  }

  // ---------- Phase 3: update beets DB paths ----------
  log("");
  log("Phase 3: updating beets DB paths...");
  const dbPath = getBeetsLibraryDbPath();
  if (!existsSync(dbPath)) {
    console.error(`  beets library.db not found at ${dbPath} — skipping DB update`);
  } else {
    const db = new Database(dbPath);
    const update = db.prepare("UPDATE items SET path = ? WHERE path = ?");
    const txn = db.transaction((moves) => {
      let changed = 0;
      for (const { oldPath, newPath } of moves) {
        const info = update.run(Buffer.from(newPath, "utf8"), Buffer.from(oldPath, "utf8"));
        changed += info.changes;
      }
      return changed;
    });
    const changed = txn(executedMoves);
    db.close();
    log(`  ${changed} / ${executedMoves.length} rows updated`);
  }

  // ---------- Phase 4: re-tag + re-embed artwork per quarter ----------
  log("");
  log("Phase 4: retagging + embedding artwork...");
  if (!existsSync(SINGLES_VENV_PY)) {
    console.error(`  Python venv missing at ${SINGLES_VENV_PY}. Skipping retag/artwork.`);
  } else {
    for (const quarterPath of touchedQuarters) {
      log(`  > set_album_tags.py ${basename(quarterPath)}`);
      const tagCode = await spawnStream(SINGLES_VENV_PY, [TAG_SCRIPT, quarterPath]);
      if (tagCode !== 0) {
        console.error(`    set_album_tags.py exited ${tagCode}`);
      }
      log(`  > generate_album_art.py ${basename(quarterPath)}`);
      const artCode = await spawnStream(SINGLES_VENV_PY, [ART_SCRIPT, quarterPath]);
      if (artCode !== 0) {
        console.error(`    generate_album_art.py exited ${artCode}`);
      }
    }
  }

  // ---------- Phase 5: beet update ----------
  log("");
  log("Phase 5: beet update...");
  const updateResult = await runBeetStreaming(["update"], (chunk) => process.stdout.write(chunk));
  if (updateResult.code !== 0) {
    console.error(`  beet update exited ${updateResult.code}`);
  }

  log("");
  log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
