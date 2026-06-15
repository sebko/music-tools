import { readdir } from "fs/promises";
import { join, extname } from "path";

const YEAR_RE = /^\d{4}$/;
const AUDIO_EXTS = new Set([".mp3", ".flac"]);

/**
 * Walk a library root and return absolute paths for every folder that the
 * processing pipeline should target.
 *
 * Handles two layouts:
 *   - YYYY/YYYY-MM MonthName/   (standard month subfolders)
 *   - YYYY/                     (flat year folder with audio files directly inside)
 *
 * When a year folder contains both month subfolders AND loose audio files,
 * the year folder itself is included so those loose files get processed too.
 */
export async function enumerateMonthFolders(libraryPath) {
  const folders = [];
  let years;
  try {
    years = await readdir(libraryPath, { withFileTypes: true });
  } catch {
    return folders;
  }
  for (const y of years) {
    if (!y.isDirectory() || !YEAR_RE.test(y.name)) continue;
    const yearPath = join(libraryPath, y.name);
    let entries;
    try {
      entries = await readdir(yearPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const subfolders = [];
    let hasLooseAudio = false;

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        subfolders.push(join(yearPath, entry.name));
      } else if (entry.isFile() && AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
        hasLooseAudio = true;
      }
    }

    // When a year has loose audio, return only the year folder so each
    // downstream beets phase runs once recursively (path:YYYY matches
    // everything underneath), avoiding double-processing files in any
    // subfolders. When a year has no loose audio, return its subfolders
    // individually so per-month progress still appears in the UI.
    if (hasLooseAudio) {
      folders.push(yearPath);
    } else {
      folders.push(...subfolders);
    }
  }
  return folders.sort();
}
