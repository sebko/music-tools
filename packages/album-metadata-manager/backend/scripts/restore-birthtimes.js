#!/usr/bin/env node

/**
 * Restore audio file birthtimes (Date Created) after April 8th 2026 Plex→Files sync.
 *
 * The plex→files sync called metaflac internally, which uses temp+rename and reset
 * the birthtime (Date Created in Finder) of every FLAC it touched to ~Apr 8 2026.
 * Album *folders* were never touched, so their birthtimes still reflect when each
 * album was originally added to the library.
 *
 * This script restores each affected audio file's birthtime to match its parent
 * folder's birthtime — elegantly solving the old-vs-new problem:
 *   - Old album (2023 folder) → files restored to 2023  ✓
 *   - New album (Mar 2026 folder) → files get Mar 2026   ✓
 *   - Brand-new album (Apr 8 folder) → files keep Apr 8  ✓
 *
 * Usage:
 *   node backend/scripts/restore-birthtimes.js                         # dry-run
 *   node backend/scripts/restore-birthtimes.js --apply                 # write changes
 *   node backend/scripts/restore-birthtimes.js --music-dir /path/to/music
 */

import { stat, readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import { restoreTimestamps } from '../services/timestamps.js';

// ── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_MUSIC_DIR = '/Volumes/T7/Albums';
const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3', '.m4a']);

// Only touch files whose birthtime falls in this window (the Apr 8 sync date).
// Narrowed to April 8 only — the sync ran at ~6:11pm that day.
// Albums downloaded on Apr 7 have correct birthtimes matching their folders.
const SYNC_WINDOW_START = new Date('2026-04-08T00:00:00');
const SYNC_WINDOW_END   = new Date('2026-04-08T23:59:59');

// ── Args ─────────────────────────────────────────────────────────────────────

const applyMode = process.argv.includes('--apply');

const musicDirIdx = process.argv.indexOf('--music-dir');
const musicDir = musicDirIdx !== -1 ? process.argv[musicDirIdx + 1] : DEFAULT_MUSIC_DIR;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date) {
  return date.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function isInSyncWindow(date) {
  return date >= SYNC_WINDOW_START && date <= SYNC_WINDOW_END;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode:      ${applyMode ? '🔴 APPLY (will restore file birthtimes)' : '🟢 DRY RUN (no changes)'}`);
  console.log(`Music dir: ${musicDir}\n`);

  if (!existsSync(musicDir)) {
    console.error(`ERROR: Music directory not found: ${musicDir}`);
    console.error('Is the drive mounted?');
    process.exit(1);
  }

  const entries = await readdir(musicDir, { withFileTypes: true });
  const albumDirs = entries
    .filter(e => e.isDirectory())
    .map(e => join(musicDir, e.name))
    .sort();

  let albumsWithChanges = 0;
  let albumsSkippedNewOrClean = 0;
  let totalFilesAffected = 0;
  let totalFilesOk = 0;
  const errors = [];

  for (const albumPath of albumDirs) {
    let folderStat;
    try {
      folderStat = await stat(albumPath);
    } catch (err) {
      errors.push(`stat folder: ${albumPath} — ${err.message}`);
      continue;
    }
    const folderBirthtime = folderStat.birthtime;

    // If the folder itself is April 8th, this album was genuinely added that day —
    // nothing to restore, the files' April 8th dates are correct.
    if (isInSyncWindow(folderBirthtime)) {
      albumsSkippedNewOrClean++;
      continue;
    }

    let files;
    try {
      files = await readdir(albumPath);
    } catch (err) {
      errors.push(`readdir: ${albumPath} — ${err.message}`);
      continue;
    }

    const audioFiles = files
      .filter(f => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort();

    if (audioFiles.length === 0) continue;

    // Check which files need restoring
    const toRestore = [];
    for (const file of audioFiles) {
      const filePath = join(albumPath, file);
      try {
        const s = await stat(filePath);
        const alreadyMatchesFolder = s.birthtime.getTime() === folderBirthtime.getTime();
        if (isInSyncWindow(s.birthtime) && !alreadyMatchesFolder) {
          toRestore.push({ file, filePath, currentBirthtime: s.birthtime });
        } else {
          totalFilesOk++;
        }
      } catch (err) {
        errors.push(`stat file: ${filePath} — ${err.message}`);
      }
    }

    if (toRestore.length === 0) {
      albumsSkippedNewOrClean++;
      continue;
    }

    albumsWithChanges++;
    totalFilesAffected += toRestore.length;

    const albumName = basename(albumPath);
    const folderIsSameWindow = isInSyncWindow(folderBirthtime);

    console.log(`📁 ${albumName}`);
    console.log(`   Folder birthtime: ${formatDate(folderBirthtime)}${folderIsSameWindow ? '  ⚠️ folder also Apr 8' : ''}`);

    // Show first 3 files, then summarise
    const preview = toRestore.slice(0, 3);
    const rest = toRestore.length - preview.length;
    for (const { file, currentBirthtime } of preview) {
      console.log(`   🔄 ${file}`);
      console.log(`      ${formatDate(currentBirthtime)} → ${formatDate(folderBirthtime)}`);
    }
    if (rest > 0) {
      console.log(`   ... and ${rest} more file${rest === 1 ? '' : 's'}`);
    }

    if (applyMode) {
      for (const { filePath } of toRestore) {
        try {
          await restoreTimestamps(filePath, { birthtime: folderBirthtime, mtime: folderStat.mtime });
        } catch (err) {
          errors.push(`restore: ${filePath} — ${err.message}`);
        }
      }
      console.log(`   ✅ ${toRestore.length} file${toRestore.length === 1 ? '' : 's'} restored`);
    }
  }

  // Summary
  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  Albums with Apr 8 files: ${albumsWithChanges}`);
  console.log(`  Albums skipped (no Apr 8 birthtimes): ${albumsSkippedNewOrClean}`);
  console.log(`  Audio files ${applyMode ? 'restored' : 'to restore'}: ${totalFilesAffected}`);
  console.log(`  Audio files already OK:  ${totalFilesOk}`);

  if (errors.length > 0) {
    console.log(`\n── Errors (${errors.length}) ─────────────────────────────────────`);
    errors.forEach(e => console.log(`  ${e}`));
  }

  if (!applyMode) {
    console.log('\nThis was a dry run. Run with --apply to restore the birthtimes.');
    console.log(`\n  node backend/scripts/restore-birthtimes.js --apply`);
  } else {
    console.log('\nDone! Open Finder, sort by Date Created, and verify the order looks correct.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
