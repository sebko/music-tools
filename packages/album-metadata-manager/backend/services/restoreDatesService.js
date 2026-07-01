/**
 * Restore Dates Service — recover Plex "Date Added" from filesystem birthtimes
 *
 * When a Plex library is rescanned after being maintained for a while, Plex
 * resets every album's `added_at` to the rescan date. Plex keeps no record of
 * the original add date (its own `created_at` / `media_parts.created_at` are
 * either the rescan date or empty), so the best available proxy is the album's
 * creation time on disk.
 *
 * This module builds a "restore plan" — the set of albums whose Plex added_at
 * should be rewritten to their on-disk creation date — and is shared by both
 * the preview (dry-run) and apply routes so the two can never drift.
 */

import os from "os";
import path from "path";
import { writeFileSync, unlinkSync, statSync } from "fs";
import { execSync } from "child_process";

/**
 * Folders/files that lost their creation date during a copy or rsync report the
 * filesystem zero-date (1904-01-01 on HFS, 1970-01-01 on Unix). Any birthtime
 * before this floor is treated as "no real creation date" and skipped rather
 * than written to Plex — writing it would replace a merely-wrong date with an
 * absurd one (e.g. 1904).
 */
export const MIN_PLAUSIBLE_ADDED_AT = Math.floor(Date.UTC(2000, 0, 1) / 1000);

/** Absolute path to the local Plex Media Server SQLite database. */
export function getPlexDbPath() {
  return path.join(
    os.homedir(),
    "Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
  );
}

const formatDate = (unixSeconds) =>
  new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);

/**
 * Query one row per album: its id, title, current added_at, and the absolute
 * path of a representative track file (from which we derive the album folder).
 */
function queryAlbums(plexDb) {
  const sep = "\x1f";
  const sql = `SELECT
       mi.id,
       mi.title,
       mi.added_at,
       MIN(mp.file) as file_path
     FROM metadata_items mi
     JOIN metadata_items tracks ON tracks.parent_id = mi.id AND tracks.metadata_type = 10
     JOIN media_items mei ON tracks.id = mei.metadata_item_id
     JOIN media_parts mp ON mei.id = mp.media_item_id
     WHERE mi.metadata_type = 9
     GROUP BY mi.id`;

  const tmpFile = path.join(os.tmpdir(), `plex-restore-${Date.now()}.sql`);
  writeFileSync(tmpFile, `.separator '${sep}'\n${sql}\n`);
  try {
    const raw = execSync(
      `/usr/bin/sqlite3 ${JSON.stringify(plexDb)} < ${JSON.stringify(tmpFile)}`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, shell: true }
    );
    return raw.trim().split("\n").filter(Boolean).map((line) => line.split(sep));
  } finally {
    unlinkSync(tmpFile);
  }
}

/**
 * Resolve an album's on-disk creation date (seconds) from a representative
 * track file path. We consider both the album folder and the file itself and
 * take the earliest plausible birthtime: the folder is the usual signal, but a
 * folder that lost its birthtime (reports 1904/1970) is rescued by the file,
 * and vice versa. `min` of the valid candidates favours the earliest — the best
 * estimate of when the album first landed on disk.
 *
 * @returns {{ accessible: boolean, birthtime: number|null }}
 *   accessible=false → neither folder nor file could be stat'd (drive unmounted
 *   or folder gone). birthtime=null → present but no plausible creation date.
 */
function resolveBirthtime(filePath) {
  const folderPath = path.dirname(filePath);
  const candidates = [];
  for (const p of [folderPath, filePath]) {
    try {
      candidates.push(Math.floor(statSync(p).birthtimeMs / 1000));
    } catch {
      // Not accessible — folder missing or drive unmounted.
    }
  }
  if (candidates.length === 0) return { accessible: false, birthtime: null };
  const valid = candidates.filter((bt) => bt >= MIN_PLAUSIBLE_ADDED_AT);
  return { accessible: true, birthtime: valid.length ? Math.min(...valid) : null };
}

/**
 * Classify every album and collect the updates needed to restore added_at.
 *
 * @param {string} plexDb - Path to the Plex SQLite DB
 * @returns {{
 *   summary: { total, toUpdate, alreadyCorrect, missing, invalid },
 *   changes: Array<{ id, title, oldDate, newDate }>,   // only albums to update
 *   updates: Array<[albumId: number, newAddedAt: number]>,
 * }}
 */
export function buildRestoreDatePlan(plexDb) {
  const rows = queryAlbums(plexDb);

  let toUpdate = 0;
  let alreadyCorrect = 0;
  let missing = 0; // folder/file not accessible (drive unmounted or gone)
  let invalid = 0; // accessible but no plausible creation date — skipped
  const changes = [];
  const updates = [];

  for (const [idStr, title, addedAtStr, filePath] of rows) {
    const albumId = parseInt(idStr, 10);
    const currentAddedAt = parseInt(addedAtStr, 10);
    const { accessible, birthtime } = resolveBirthtime(filePath);

    if (!accessible) {
      missing++;
    } else if (birthtime === null) {
      invalid++;
    } else if (birthtime === currentAddedAt) {
      alreadyCorrect++;
    } else {
      toUpdate++;
      updates.push([albumId, birthtime]);
      changes.push({
        id: albumId,
        title,
        oldDate: formatDate(currentAddedAt),
        newDate: formatDate(birthtime),
      });
    }
  }

  return {
    summary: { total: rows.length, toUpdate, alreadyCorrect, missing, invalid },
    changes,
    updates,
  };
}
