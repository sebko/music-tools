#!/usr/bin/env node
/*
 * Recovery pass for the aborted 2025 quarter consolidation.
 * Filesystem is already in final state; this only handles phases 3-5:
 *   - rewrite beets DB path prefixes (month -> quarter)
 *   - re-tag + re-embed art per quarter folder
 *   - beet update
 */
import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
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

  // ---------- Phase 3: rewrite beets DB paths via prefix replace ----------
  console.log("Phase 3: rewriting beets DB path prefixes...");
  const dbPath = getBeetsLibraryDbPath();
  const db = new Database(dbPath);

  // Pull all 2025 rows, rewrite in JS, write back.
  const rows = db.prepare(
    "SELECT id, CAST(path AS TEXT) AS path FROM items WHERE CAST(path AS TEXT) LIKE ?",
  ).all(`${yearRoot}/%`);
  console.log(`  Found ${rows.length} rows under ${yearRoot}`);

  const update = db.prepare("UPDATE items SET path = ? WHERE id = ?");
  let changed = 0;
  const txn = db.transaction(() => {
    for (const row of rows) {
      let newPath = row.path;
      for (const [monthName, quarterName] of Object.entries(QUARTER_MAP)) {
        const oldPrefix = `${yearRoot}/${monthName}/`;
        const newPrefix = `${yearRoot}/${quarterName}/`;
        if (newPath.startsWith(oldPrefix)) {
          newPath = newPrefix + newPath.slice(oldPrefix.length);
          break;
        }
      }
      if (newPath !== row.path) {
        update.run(Buffer.from(newPath, "utf8"), row.id);
        changed += 1;
      }
    }
  });
  txn();
  db.close();
  console.log(`  ${changed} rows updated`);

  // ---------- Phase 4: re-tag + embed art per quarter ----------
  console.log("");
  console.log("Phase 4: retagging + embedding artwork...");
  if (!existsSync(SINGLES_VENV_PY)) {
    console.error(`  Python venv missing at ${SINGLES_VENV_PY}`);
  } else {
    const quarters = readdirSync(yearRoot)
      .filter((n) => /^2025-Q[1-4]$/.test(n))
      .map((n) => join(yearRoot, n));

    for (const quarterPath of quarters) {
      console.log(`  > set_album_tags.py ${quarterPath}`);
      const tagCode = await spawnStream(SINGLES_VENV_PY, [TAG_SCRIPT, quarterPath]);
      if (tagCode !== 0) console.error(`    set_album_tags.py exited ${tagCode}`);

      console.log(`  > generate_album_art.py ${quarterPath}`);
      const artCode = await spawnStream(SINGLES_VENV_PY, [ART_SCRIPT, quarterPath]);
      if (artCode !== 0) console.error(`    generate_album_art.py exited ${artCode}`);
    }
  }

  // ---------- Phase 5: beet update ----------
  console.log("");
  console.log("Phase 5: beet update...");
  const result = await runBeetStreaming(["update"], (chunk) => process.stdout.write(chunk));
  if (result.code !== 0) console.error(`  beet update exited ${result.code}`);

  console.log("");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
