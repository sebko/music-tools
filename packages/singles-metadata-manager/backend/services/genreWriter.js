import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const BEETS_VENV_PY = resolvePath(
  __dirname,
  "..",
  "..",
  "beets",
  ".venv",
  "bin",
  "python",
);
const WRITE_GENRES_MP3_SCRIPT = resolvePath(
  __dirname,
  "..",
  "scripts",
  "write_genres_mp3.py",
);

/**
 * Normalize a genre string to Title Case.
 * Handles: "hip hop" → "Hip Hop", "trip.hop" → "Trip Hop"
 * Ported from album-metadata-manager/backend/services/plexToFileWriter.js
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
 * Ported from album-metadata-manager/backend/services/plexToFileWriter.js
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
    await writeGenresMp3(filePath, clean);
    return;
  }
  if (ext === ".flac") {
    await writeGenresFlac(filePath, clean);
    return;
  }
  throw new Error(`writeGenres: unsupported file extension ${ext}`);
}

async function writeGenresMp3(filePath, genres) {
  // node-id3tag.write() silently drops TCON when the existing tags
  // contain both USLT (lyrics) and APIC (cover art) — it returns true
  // but the frame is missing on read-back. Mutagen handles ID3v2.4
  // multi-value TCON correctly; we shell out to the beets venv python.
  await execFileAsync(
    BEETS_VENV_PY,
    [WRITE_GENRES_MP3_SCRIPT, filePath, ...genres],
    { timeout: 30_000 },
  );
}

async function writeGenresFlac(filePath, genres) {
  await execFileAsync("metaflac", ["--remove-tag=GENRE", filePath]);
  const setTagArgs = genres.map((g) => `--set-tag=GENRE=${g}`);
  await execFileAsync("metaflac", [...setTagArgs, filePath]);
}
