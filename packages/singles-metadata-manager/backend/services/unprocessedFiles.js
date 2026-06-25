import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname, resolve } from "path";
import Database from "better-sqlite3";
import { getBeetsLibraryDbPath } from "./beetsConfig.js";

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".aiff",
  ".aif",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wma",
]);

async function walkAudioFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await walkAudioFiles(full, out);
    } else if (entry.isFile()) {
      if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out;
}

function readImportedPaths() {
  const dbPath = getBeetsLibraryDbPath();
  if (!existsSync(dbPath)) return new Set();
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT CAST(path AS TEXT) as path FROM items").all();
    return new Set(rows.map((r) => resolve(r.path)));
  } finally {
    db.close();
  }
}

/**
 * Returns audio files under `libraryPath` that are NOT present in the beets DB.
 * These are the files that failed import (bad tags, corrupted, unsupported).
 */
export async function listUnprocessedFiles(libraryPath) {
  const files = await walkAudioFiles(libraryPath);
  const imported = readImportedPaths();
  return files
    .map((f) => resolve(f))
    .filter((f) => !imported.has(f))
    .sort();
}
