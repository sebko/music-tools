import { spawn } from "child_process";
import { existsSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { getBeetsLibraryDbPath } from "./beetsConfig.js";
import { runBeetStreaming } from "./beetsRunner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// metadata-manager/backend/services/ → dj-tools/packages/singles-metadata-manager/
const SINGLES_DIR = resolvePath(__dirname, "..", "..", "..", "singles-metadata-manager");
export const SINGLES_VENV_PY = join(SINGLES_DIR, ".venv", "bin", "python");
const SINGLES_SCRIPTS = join(SINGLES_DIR, "scripts");
export const TAG_SCRIPT = join(SINGLES_SCRIPTS, "set_album_tags.py");
export const ART_SCRIPT = join(SINGLES_SCRIPTS, "generate_album_art.py");

// Matches ANSI CSI sequences (colors, cursor moves) emitted by beets when it
// thinks it's writing to a terminal. Strip before storing the log so the
// collapsible details panels in the UI stay readable.
// eslint-disable-next-line no-control-regex
const ANSI_CSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
export const stripAnsi = (s) => s.replace(ANSI_CSI_RE, "");

// Match "  Setting #N: FILENAME..." from set_album_tags.py
//   and "  Embedding: FILENAME..." from generate_album_art.py
const SETTING_LINE = /^\s+Setting\s+#\d+:\s+(.+?)\.\.\.\s*$/;
const EMBEDDING_LINE = /^\s+Embedding:\s+(.+?)\.\.\.\s*$/;

export function parsePythonProgressLine(line) {
  const m1 = line.match(SETTING_LINE);
  if (m1) return m1[1];
  const m2 = line.match(EMBEDDING_LINE);
  if (m2) return m2[1];
  return null;
}

// Match any audio file basename in a line. Used to count progress during
// `beet import` and the various `beet <plugin>` phases (bad, scrub,
// ftintitle, replaygain) whose exact line format is version-dependent but
// always mentions the path of the file being processed.
const AUDIO_FILE_RE = /([^/\s'"`]+\.(?:mp3|flac|wav|aiff|aif|m4a|aac|ogg|opus|wma))\b/i;

export function parseBeetProgressLine(line) {
  const m = line.match(AUDIO_FILE_RE);
  return m ? m[1] : null;
}

export const parseImportProgressLine = parseBeetProgressLine;

export function countItemsInFolders(folders) {
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

// Stream a child process line-by-line, invoking onLine for each complete line.
export function spawnStream(cmd, args, onLine) {
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

/**
 * Bind patch/appendOutput closures to an operations map entry so the pipeline
 * can stream progress without knowing anything about where the op is stored.
 */
export function createOpHelpers(operationsMap, opId) {
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
  return { patch, appendOutput };
}

/**
 * Build a phase runner that loops `beet <args>` across `monthFolders`, parses
 * progress out of the streamed output, and patches the current op record.
 * Non-fatal phases log the error and continue; fatal phases throw.
 */
export function createRunBeetPhase(patch, appendOutput) {
  return async function runBeetPhase({ phase, args, monthFolders, phaseTotal, fatal = true }) {
    patch({ phase, processed: 0, total: phaseTotal, currentFile: null });
    let processed = 0;
    for (const monthFolder of monthFolders) {
      const result = await runBeetStreaming(
        [...args, `path:${monthFolder}`],
        (chunk) => {
          appendOutput(chunk);
          for (const line of chunk.split("\n")) {
            const fn = parseBeetProgressLine(line);
            if (fn) {
              processed += 1;
              patch({
                processed: Math.min(processed, phaseTotal),
                currentFile: fn,
              });
            }
          }
        },
      );
      if (result.code !== 0) {
        if (fatal) {
          throw new Error(
            `beet ${args[0]} failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
          );
        }
        appendOutput(`(beet ${args[0]} exited ${result.code}; continuing)\n`);
      }
    }
    patch({ processed: phaseTotal, currentFile: null });
  };
}
