import { rm, stat } from "fs/promises";
import { dirname, join } from "path";
import { closeDb } from "./beetsDb.js";
import { getBeetsLibraryDbPath } from "./beetsConfig.js";

/**
 * Deletes the beets library.db (plus its SQLite sidecar files if present)
 * AND `state.pickle`, which beets uses to track `import.incremental` history
 * OUTSIDE the DB. Without this, a freshly-wiped library will still skip every
 * previously-seen path on the next `beet import`, silently producing a zero
 * import and confusing the wizard. Closes the cached better-sqlite3 handle
 * first so we don't leak it. Safe to call even if the files don't exist yet.
 */
export async function resetBeetsLibraryDb() {
  closeDb();
  const dbPath = getBeetsLibraryDbPath();
  const beetsDir = dirname(dbPath);
  const targets = [
    dbPath,
    `${dbPath}-journal`,
    `${dbPath}-wal`,
    `${dbPath}-shm`,
    join(beetsDir, "state.pickle"),
  ];
  for (const target of targets) {
    await rm(target, { force: true });
  }
  return { dbPath };
}

export async function libraryDbExists() {
  try {
    const s = await stat(getBeetsLibraryDbPath());
    return s.isFile();
  } catch {
    return false;
  }
}
