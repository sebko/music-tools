import { readdir } from "fs/promises";
import { join, extname } from "path";
import { checkGenreFormat } from "./genreFormatChecker.js";
import { writeGenres } from "./genreWriter.js";

const SUPPORTED = new Set([".mp3", ".flac"]);

async function walkSupportedFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return out;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSupportedFiles(full, out);
    } else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Walk the given month folders and ensure every mp3/flac with genres uses
 * the correct multi-value encoding: ID3v2.4 TCON null-separated for mp3,
 * multiple Vorbis GENRE comments for flac. Files without genres or already
 * correctly formatted are left untouched.
 */
export async function normalizeGenresInFolders(monthFolders, { onFile } = {}) {
  let checked = 0;
  let normalized = 0;

  for (const folder of monthFolders) {
    const files = await walkSupportedFiles(folder);
    for (const filePath of files) {
      checked += 1;
      const { genres, correctlyFormatted, hasGenres } = await checkGenreFormat(filePath);

      if (!hasGenres || correctlyFormatted) {
        onFile?.({ filePath, action: "skipped" });
        continue;
      }

      const split = genres
        .flatMap((g) => g.split(/[,;]/))
        .map((g) => g.trim())
        .filter(Boolean);

      await writeGenres(filePath, split);
      normalized += 1;
      onFile?.({ filePath, action: "normalized" });
    }
  }

  return { checked, normalized };
}
