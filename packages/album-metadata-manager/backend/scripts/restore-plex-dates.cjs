#!/usr/bin/env node

/**
 * Restore Plex "Date Added" timestamps from folder birthtimes.
 *
 * After a Plex library rescan, all albums had their added_at reset to the
 * scan time. The correct dates are preserved as folder creation dates
 * (birthtimes) on the external drive.
 *
 * Usage:
 *   node backend/scripts/restore-plex-dates.js            # dry-run (default)
 *   node backend/scripts/restore-plex-dates.js --apply     # actually write changes
 *
 * Prerequisites:
 *   - Plex Media Server should be STOPPED before running with --apply
 *   - The music drive (/Volumes/T7/Albums) must be mounted
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────────────

const PLEX_DB = path.join(
  os.homedir(),
  'Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db'
);

const LIBRARY_ROOT = '/Volumes/T7/Albums';

const applyMode = process.argv.includes('--apply');

// ── Helpers ─────────────────────────────────────────────────────────────────

function sqliteQuery(db, sql) {
  // Write SQL to temp file to avoid shell escaping issues
  const sep = '\x1f'; // ASCII Unit Separator
  const tmpFile = path.join(os.tmpdir(), `plex-restore-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, `.separator '${sep}'\n${sql}\n`);
  try {
    const raw = execSync(
      `/usr/bin/sqlite3 ${JSON.stringify(db)} < ${JSON.stringify(tmpFile)}`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, shell: true }
    );
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(sep));
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function sqliteExec(db, sql) {
  const tmpFile = path.join(os.tmpdir(), `plex-restore-exec-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sql);
  try {
    execSync(`/usr/bin/sqlite3 ${JSON.stringify(db)} < ${JSON.stringify(tmpFile)}`, {
      encoding: 'utf-8',
      shell: true,
    });
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Given a relative directory path from Plex (which may be a subdirectory for
 * multi-disc albums like "artist - album/cd 1"), return the top-level album
 * folder path under the library root.
 */
function getAlbumFolder(relativeDirPath) {
  // The first path segment is always the album folder
  const topLevel = relativeDirPath.split('/')[0];
  return path.join(LIBRARY_ROOT, topLevel);
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log(`Mode: ${applyMode ? '🔴 APPLY (will write to DB)' : '🟢 DRY RUN (no changes)'}`);
  console.log(`Plex DB: ${PLEX_DB}`);
  console.log(`Library: ${LIBRARY_ROOT}\n`);

  // Check DB exists
  if (!fs.existsSync(PLEX_DB)) {
    console.error('ERROR: Plex database not found at expected path.');
    process.exit(1);
  }

  // Check library is mounted
  if (!fs.existsSync(LIBRARY_ROOT)) {
    console.error(`ERROR: Library root not found: ${LIBRARY_ROOT}`);
    console.error('Is the drive mounted?');
    process.exit(1);
  }

  // Backup DB before writing
  if (applyMode) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${PLEX_DB}.backup-${timestamp}`;
    console.log(`Backing up database to:\n  ${backupPath}\n`);
    fs.copyFileSync(PLEX_DB, backupPath);
  }

  // Query all albums with their folder paths.
  // We pick one representative file path per album (MIN) to determine the folder.
  console.log('Querying albums from Plex database...');
  const rows = sqliteQuery(
    PLEX_DB,
    `SELECT
       mi.id,
       mi.title,
       mi.added_at,
       MIN(d.path) as dir_path
     FROM metadata_items mi
     JOIN metadata_items tracks ON tracks.parent_id = mi.id AND tracks.metadata_type = 10
     JOIN media_items mei ON tracks.id = mei.metadata_item_id
     JOIN media_parts mp ON mei.id = mp.media_item_id
     JOIN directories d ON mp.directory_id = d.id
     WHERE mi.metadata_type = 9
     GROUP BY mi.id`
  );

  console.log(`Found ${rows.length} albums in Plex database.\n`);

  let updated = 0;
  let skippedSame = 0;
  let skippedMissing = 0;
  const errors = [];
  const updates = []; // [albumId, newTimestamp, title]

  for (const [idStr, title, addedAtStr, dirPath] of rows) {
    const albumId = parseInt(idStr, 10);
    const currentAddedAt = parseInt(addedAtStr, 10);
    const folderPath = getAlbumFolder(dirPath);

    try {
      const stat = fs.statSync(folderPath);
      const birthtime = Math.floor(stat.birthtimeMs / 1000);

      if (birthtime === currentAddedAt) {
        skippedSame++;
        continue;
      }

      updates.push([albumId, birthtime, title, currentAddedAt]);
      updated++;
    } catch (err) {
      if (err.code === 'ENOENT') {
        skippedMissing++;
        errors.push(`  NOT FOUND: ${folderPath} (album: ${title})`);
      } else {
        errors.push(`  ERROR: ${folderPath} — ${err.message}`);
      }
    }
  }

  // Show sample of changes
  console.log('── Sample changes (first 20) ──');
  for (const [albumId, newTs, title, oldTs] of updates.slice(0, 20)) {
    console.log(`  ${title}`);
    console.log(`    ${formatDate(oldTs)} → ${formatDate(newTs)}`);
  }
  if (updates.length > 20) {
    console.log(`  ... and ${updates.length - 20} more\n`);
  }

  // Summary
  console.log('\n── Summary ──');
  console.log(`  Total albums:    ${rows.length}`);
  console.log(`  To update:       ${updated}`);
  console.log(`  Already correct: ${skippedSame}`);
  console.log(`  Folder missing:  ${skippedMissing}`);

  if (errors.length > 0) {
    console.log(`\n── Errors (${errors.length}) ──`);
    errors.forEach((e) => console.log(e));
  }

  // Apply changes
  if (applyMode && updates.length > 0) {
    console.log(`\nApplying ${updates.length} updates...`);

    // Plex's metadata_items table has FTS triggers that reference a custom ICU
    // tokenizer (fts4_metadata_titles_icu) which only exists when Plex is running.
    // Any UPDATE on metadata_items fires these triggers, causing
    // "unknown tokenizer: collating" errors. We drop them before our batch and
    // recreate them after. Since we only change added_at (not title/title_sort/
    // original_title), skipping the FTS triggers is semantically correct.
    const dropTriggers = [
      'DROP TRIGGER IF EXISTS fts4_metadata_titles_before_update_icu;',
      'DROP TRIGGER IF EXISTS fts4_metadata_titles_after_update_icu;',
      'DROP TRIGGER IF EXISTS fts4_metadata_titles_before_delete_icu;',
      'DROP TRIGGER IF EXISTS fts4_metadata_titles_after_insert_icu;',
    ].join('\n');

    const recreateTriggers = [
      'CREATE TRIGGER fts4_metadata_titles_before_update_icu BEFORE UPDATE ON metadata_items BEGIN DELETE FROM fts4_metadata_titles_icu WHERE docid=old.rowid; END;',
      'CREATE TRIGGER fts4_metadata_titles_after_update_icu AFTER UPDATE ON metadata_items BEGIN INSERT INTO fts4_metadata_titles_icu(docid, title, title_sort, original_title) VALUES(new.rowid, new.title, new.title_sort, new.original_title); END;',
      'CREATE TRIGGER fts4_metadata_titles_before_delete_icu BEFORE DELETE ON metadata_items BEGIN DELETE FROM fts4_metadata_titles_icu WHERE docid=old.rowid; END;',
      'CREATE TRIGGER fts4_metadata_titles_after_insert_icu AFTER INSERT ON metadata_items BEGIN INSERT INTO fts4_metadata_titles_icu(docid, title, title_sort, original_title) VALUES(new.rowid, new.title, new.title_sort, new.original_title); END;',
    ].join('\n');

    // Build a single transaction with all UPDATEs
    const statements = updates.map(
      ([albumId, newTs]) => `UPDATE metadata_items SET added_at = ${newTs} WHERE id = ${albumId};`
    );

    const sql = [
      dropTriggers,
      'BEGIN TRANSACTION;',
      ...statements,
      'COMMIT;',
      recreateTriggers,
    ].join('\n');

    sqliteExec(PLEX_DB, sql);
    console.log('Done! All updates applied successfully.');
    console.log('FTS triggers have been restored.');
    console.log('\nNext step: Start Plex Media Server and verify dates.');
  } else if (applyMode) {
    console.log('\nNo changes needed.');
  } else {
    console.log(`\nThis was a dry run. To apply changes, run with --apply`);
  }
}

main();
