import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname } from "node:path";
import NodeID3 from "node-id3tag";

const execFileAsync = promisify(execFile);

/**
 * Normalize a genre string to Title Case.
 * Handles: "hip hop" → "Hip Hop", "trip.hop" → "Trip Hop"
 * Ported from music-tagger/backend/services/plexToFileWriter.js
 */
export function normalizeGenre(genre) {
  if (!genre) return genre;
  return genre
    .replace(/\./g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/**
 * Normalize, deduplicate (case-insensitive), and sort an array of genres.
 * Ported from music-tagger/backend/services/plexToFileWriter.js
 */
function mergeAndNormalizeGenres(genres) {
  const genreMap = new Map();
  genres.map(normalizeGenre).filter(Boolean).forEach((genre) => {
    const key = genre.toLowerCase();
    if (!genreMap.has(key)) genreMap.set(key, genre);
  });
  return Array.from(genreMap.values()).sort();
}

/**
 * Write a multi-value genre list to an audio file using the correct
 * per-format encoding for DJ apps that expect real multi-value fields
 * (verified against Pentaton iOS on 2026-04-14).
 *
 * MP3  → ID3v2.4 TCON with null-byte separators (via node-id3tag).
 * FLAC → separate Vorbis `GENRE=...` comments (via metaflac).
 *
 * Genres are normalized to Title Case, deduplicated, and sorted before writing.
 */
export async function writeGenres(filePath, genres) {
  if (!Array.isArray(genres)) {
    throw new Error("writeGenres: genres must be an array");
  }
  const clean = mergeAndNormalizeGenres(genres);
  if (clean.length === 0) {
    throw new Error("writeGenres: genres array was empty after normalization");
  }

  const ext = extname(filePath).toLowerCase();
  if (ext === ".mp3") {
    writeGenresMp3(filePath, clean);
    return;
  }
  if (ext === ".flac") {
    await writeGenresFlac(filePath, clean);
    return;
  }
  throw new Error(`writeGenres: unsupported file extension ${ext}`);
}

function writeGenresMp3(filePath, genres) {
  // node-id3tag's update() is broken for text frames: it converts alias
  // keys (genre) to raw keys (TCON) before calling write(), but write()'s
  // frame lookup only matches alias keys. The workaround is to read the
  // existing tags (which come back as aliases), drop the raw copy, merge
  // the new genre array in, and write the whole alias-keyed object back.
  const existing = NodeID3.read(filePath) || {};
  delete existing.raw;
  const merged = { ...existing, genre: genres };
  const result = NodeID3.write(merged, filePath);
  if (result !== true) {
    const detail = result instanceof Error ? result.message : String(result);
    throw new Error(`node-id3tag write failed for ${filePath}: ${detail}`);
  }
}

async function writeGenresFlac(filePath, genres) {
  await execFileAsync("metaflac", ["--remove-tag=GENRE", filePath]);
  const setTagArgs = genres.map((g) => `--set-tag=GENRE=${g}`);
  await execFileAsync("metaflac", [...setTagArgs, filePath]);
}
