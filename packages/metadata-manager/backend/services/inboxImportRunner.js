import { spawn } from "child_process";
import { dirname, join, basename, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import { existsSync, renameSync, mkdirSync } from "fs";
import Database from "better-sqlite3";
import { getBeetsLibraryDbPath } from "./beetsConfig.js";
import { runBeetStreaming } from "./beetsRunner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// metadata-manager/backend/services/ → dj-tools/packages/singles-metadata-manager/
const SINGLES_DIR = resolvePath(__dirname, "..", "..", "..", "singles-metadata-manager");
const SINGLES_VENV_PY = join(SINGLES_DIR, ".venv", "bin", "python");
const SINGLES_SCRIPTS = join(SINGLES_DIR, "scripts");
const TAG_SCRIPT = join(SINGLES_SCRIPTS, "set_album_tags.py");
const ART_SCRIPT = join(SINGLES_SCRIPTS, "generate_album_art.py");

function readImportedPaths() {
  const dbPath = getBeetsLibraryDbPath();
  if (!existsSync(dbPath)) return new Set();
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT CAST(path AS TEXT) as path FROM items").all();
    return new Set(rows.map((r) => resolvePath(r.path)));
  } finally {
    db.close();
  }
}

function countItemsInFolders(folders) {
  const dbPath = getBeetsLibraryDbPath();
  if (!existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true });
  try {
    let total = 0;
    const stmt = db.prepare(
      "SELECT COUNT(*) as count FROM items WHERE CAST(path AS TEXT) LIKE ?",
    );
    for (const folder of folders) {
      const row = stmt.get(folder + "/%");
      total += row?.count ?? 0;
    }
    return total;
  } finally {
    db.close();
  }
}

function uniqueYearFolders(paths, libraryRoot) {
  const libRoot = resolvePath(libraryRoot);
  const years = new Set();
  for (const p of paths) {
    if (!p.startsWith(libRoot + "/")) continue;
    const rel = p.slice(libRoot.length + 1);
    const parts = rel.split("/");
    if (parts.length >= 2) years.add(parts[0]);
  }
  return [...years].map((y) => join(libRoot, y));
}

// Stream a child process line-by-line, invoking onLine for each complete line.
function spawnStream(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    let buf = "";

    const flushBuffered = (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) onLine(line);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      stdout += c;
      flushBuffered(c);
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (buf) onLine(buf);
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

// Match "  Setting #N: FILENAME..." from set_album_tags.py
//   and "  Embedding: FILENAME..." from generate_album_art.py
const SETTING_LINE = /^\s+Setting\s+#\d+:\s+(.+?)\.\.\.\s*$/;
const EMBEDDING_LINE = /^\s+Embedding:\s+(.+?)\.\.\.\s*$/;

function parsePythonProgressLine(line) {
  const m1 = line.match(SETTING_LINE);
  if (m1) return m1[1];
  const m2 = line.match(EMBEDDING_LINE);
  if (m2) return m2[1];
  return null;
}

// Match any audio file basename in a line. Used to count progress during
// `beet import`, whose exact line format is version-dependent but always
// mentions the path of the file being added.
const AUDIO_FILE_RE = /([^/\s'"`]+\.(?:mp3|flac|wav|aiff|aif|m4a|aac|ogg|opus|wma))\b/i;

function parseImportProgressLine(line) {
  const m = line.match(AUDIO_FILE_RE);
  return m ? m[1] : null;
}

/**
 * Run the full inbox import pipeline under an existing operation id.
 * Pipeline:
 *   0. Move files from inbox into library's current month folder
 *   1. beet import -A <monthFolder>
 *   2. set_album_tags.py <yearFolder>    (for each affected year)
 *   3. generate_album_art.py <yearFolder>
 *   4. beet update
 *
 * The operation record in `operationsMap` is mutated in place with
 * `{ phase, processed, total, currentFile, output, status, error }` so the
 * existing `/api/beets/operations/:id` polling endpoint works unchanged.
 */
// Matches ANSI CSI sequences (colors, cursor moves) emitted by beets when it
// thinks it's writing to a terminal. We strip them before storing the log so
// the collapsible details in the UI stay readable.
// eslint-disable-next-line no-control-regex
const ANSI_CSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const stripAnsi = (s) => s.replace(ANSI_CSI_RE, "");

/**
 * Compute the library month folder path for the current date.
 * Matches existing structure: YYYY/YYYY-MM MonthName (e.g. 2026/2026-04 April).
 */
function currentMonthFolder(libraryPath) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const folderName = `${year}-${String(month + 1).padStart(2, "0")} ${monthName}`;
  const yearPath = join(libraryPath, String(year));
  const monthPath = join(yearPath, folderName);
  return { yearPath, monthPath, folderName };
}

/**
 * Move files from the inbox into the library's current month folder.
 * Creates year/month folders if they don't exist.
 * Returns an array of destination paths.
 */
function moveFilesToLibrary(files, libraryPath) {
  const { yearPath, monthPath } = currentMonthFolder(libraryPath);
  mkdirSync(yearPath, { recursive: true });
  mkdirSync(monthPath, { recursive: true });

  const moved = [];
  for (const src of files) {
    const dest = join(monthPath, basename(src));
    renameSync(src, dest);
    moved.push(dest);
  }
  return moved;
}

export function runInboxImport(operationsMap, opId, inboxPath, libraryPath, pendingFiles) {
  const pendingTotal = pendingFiles.length;
  const patch = (delta) => {
    const current = operationsMap.get(opId);
    if (!current) return;
    operationsMap.set(opId, { ...current, ...delta });
  };
  const appendOutput = (text) => {
    const current = operationsMap.get(opId);
    if (!current) return;
    const clean = stripAnsi(text);
    operationsMap.set(opId, {
      ...current,
      output: (current.output || "") + clean + (clean.endsWith("\n") ? "" : "\n"),
    });
  };

  (async () => {
    try {
      // ---------- Step 0: move files into the library ----------
      patch({ phase: "importing", processed: 0, total: pendingTotal, currentFile: null });

      const { monthPath } = currentMonthFolder(libraryPath);
      const movedFiles = moveFilesToLibrary(pendingFiles, libraryPath);
      for (const f of movedFiles) {
        appendOutput(`Moved: ${basename(f)} -> ${monthPath}\n`);
      }

      // ---------- Step 1: beet import -A ----------
      const existingPaths = readImportedPaths();

      let importProcessed = 0;
      const importResult = await runBeetStreaming(
        ["import", "-A", monthPath],
        (chunk) => {
          appendOutput(chunk);
          for (const line of chunk.split("\n")) {
            const fn = parseImportProgressLine(line);
            if (fn) {
              importProcessed += 1;
              patch({
                processed: Math.min(importProcessed, pendingTotal),
                currentFile: fn,
              });
            }
          }
        },
      );

      if (importResult.code !== 0) {
        throw new Error(
          `beet import failed (exit ${importResult.code}): ${importResult.stderr || "(no stderr)"}`,
        );
      }

      patch({ processed: pendingTotal, currentFile: null });

      // ---------- Identify year folders touched by the import ----------
      const newPaths = [...readImportedPaths()].filter((p) => !existingPaths.has(p));
      const yearFolders = uniqueYearFolders(newPaths, libraryPath);

      if (yearFolders.length === 0) {
        // Incremental import skipped everything, or paths didn't land where
        // we expected. Nothing for the Python scripts to do — still resync
        // beets in case existing tags drifted, then finish.
        patch({ phase: "updating", processed: 0, total: 0, currentFile: null });
        await runBeetStreaming(["update"], (chunk) => appendOutput(chunk));
        patch({
          status: "completed",
          phase: "done",
          completedAt: new Date().toISOString(),
        });
        return;
      }

      if (!existsSync(SINGLES_VENV_PY)) {
        throw new Error(
          `Python venv missing at ${SINGLES_VENV_PY}. ` +
            `Run: cd packages/singles-metadata-manager && ./setup.sh`,
        );
      }

      // Use the full count of items under the affected year folders as the
      // progress denominator — the Python scripts walk recursively so they'll
      // touch every file in those years, not just the new ones.
      const phaseTotal = countItemsInFolders(yearFolders);

      // ---------- Step 2: set_album_tags.py ----------
      patch({ phase: "tagging", processed: 0, total: phaseTotal, currentFile: null });
      let tagProcessed = 0;

      for (const yearFolder of yearFolders) {
        const result = await spawnStream(
          SINGLES_VENV_PY,
          [TAG_SCRIPT, yearFolder],
          (line) => {
            appendOutput(line);
            const fn = parsePythonProgressLine(line);
            if (fn) {
              tagProcessed += 1;
              patch({
                processed: Math.min(tagProcessed, phaseTotal),
                currentFile: fn,
              });
            }
          },
        );
        if (result.code !== 0) {
          throw new Error(
            `set_album_tags.py failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
          );
        }
      }
      patch({ processed: phaseTotal, currentFile: null });

      // ---------- Step 3: generate_album_art.py ----------
      patch({ phase: "artwork", processed: 0, total: phaseTotal, currentFile: null });
      let artProcessed = 0;

      for (const yearFolder of yearFolders) {
        const result = await spawnStream(
          SINGLES_VENV_PY,
          [ART_SCRIPT, yearFolder],
          (line) => {
            appendOutput(line);
            const fn = parsePythonProgressLine(line);
            if (fn) {
              artProcessed += 1;
              patch({
                processed: Math.min(artProcessed, phaseTotal),
                currentFile: fn,
              });
            }
          },
        );
        if (result.code !== 0) {
          throw new Error(
            `generate_album_art.py failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
          );
        }
      }
      patch({ processed: phaseTotal, currentFile: null });

      // ---------- Step 4: beet update ----------
      patch({ phase: "updating", processed: 0, total: 0, currentFile: null });
      const updateResult = await runBeetStreaming(["update"], (chunk) => appendOutput(chunk));
      if (updateResult.code !== 0) {
        throw new Error(
          `beet update failed (exit ${updateResult.code}): ${updateResult.stderr || "(no stderr)"}`,
        );
      }

      patch({
        status: "completed",
        phase: "done",
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const current = operationsMap.get(opId) || {};
      operationsMap.set(opId, {
        ...current,
        status: "failed",
        error: err.message,
        completedAt: new Date().toISOString(),
      });
    }
  })();
}
