/**
 * Album Deleter - swipe albums in a library into a deletion list, then (after
 * explicit confirmation) move their folders to the volume Trash and trigger a
 * Plex scan so the entries drop out of the library.
 */

import path from "path";
import os from "os";
import { mkdir, stat, rename } from "fs/promises";
import { prisma } from "../prisma/client.js";
import { getLibrarySection, getAlbumLocation, getServerConnection } from "./plexClient.js";
import { invalidateDestinationCache } from "./favouritesWizard.js";

/**
 * Move a folder to the Trash of the volume it lives on (recoverable, unlike rm).
 * External volumes use /Volumes/<name>/.Trashes/<uid>/, the boot volume ~/.Trash.
 * @returns {Promise<string>} the path the folder was moved to
 */
export async function moveToTrash(folderPath) {
  let trashDir;
  if (folderPath.startsWith("/Volumes/")) {
    const volumeRoot = folderPath.split(path.sep).slice(0, 3).join(path.sep); // /Volumes/<name>
    trashDir = path.join(volumeRoot, ".Trashes", String(process.getuid()));
  } else {
    trashDir = path.join(os.homedir(), ".Trash");
  }
  await mkdir(trashDir, { recursive: true });

  let dest = path.join(trashDir, path.basename(folderPath));
  if (await stat(dest).catch(() => null)) {
    dest = `${dest} ${Date.now()}`; // avoid collision with an earlier deletion
  }
  await rename(folderPath, dest);
  return dest;
}

/**
 * Move every confirmed (DELETE + PENDING/FAILED) album folder for the library to
 * the volume Trash, then trigger a Plex scan and empty the section's Plex trash
 * once the scan settles. Mutates `state` (the server's deletionState).
 */
export async function runDeletion(state, library, rows) {
  const server = await getServerConnection(library.server);

  for (const row of rows) {
    if (state.shouldStop) break;

    state.current++;
    state.currentAlbum = { artist: row.artist, title: row.title };

    let status = null;
    let error = null;
    try {
      let srcPath = row.location;
      if (!srcPath) {
        srcPath = await getAlbumLocation(server, row.ratingKey);
      }
      if (!srcPath) {
        throw new Error("No folder location available for this album");
      }
      const srcStat = await stat(srcPath).catch(() => null);
      if (!srcStat?.isDirectory()) {
        throw new Error(`Folder not found: ${srcPath}`);
      }

      await moveToTrash(srcPath);
      status = "DELETED";
    } catch (err) {
      status = "FAILED";
      error = err.message;
      console.error(`❌ Deletion failed for "${row.artist} - ${row.title}":`, err.message);
    }

    await prisma.deletionSwipe.update({
      where: { id: row.id },
      data: { deleteStatus: status, deleteError: error },
    });

    if (status === "DELETED") state.deleted++;
    else state.failed++;

    state.results.push({
      ratingKey: row.ratingKey,
      artist: row.artist,
      title: row.title,
      status,
      error,
    });
  }

  state.currentAlbum = null;

  if (state.deleted > 0) {
    invalidateDestinationCache(library.id); // it may be a favourites destination
    try {
      const section = await getLibrarySection(library);
      await section.update(); // Plex: scan section so missing albums drop out
      state.scanTriggered = true;
      console.log(`🔄 Triggered Plex scan of "${library.title}" after deletion`);
    } catch (err) {
      console.error("Failed to trigger library scan after deletion:", err.message);
      return;
    }

    // Once the scan settles, empty the section's Plex trash so the deleted
    // albums disappear instead of lingering as "unavailable". Best-effort.
    emptyTrashWhenScanSettles(state, library).catch(err =>
      console.error("Failed to empty Plex trash after deletion:", err.message)
    );
  }
}

async function emptyTrashWhenScanSettles(state, library, { tries = 30, intervalMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const section = await getLibrarySection(library);
    if (!section.refreshing) {
      await section.emptyTrash();
      state.plexTrashEmptied = true;
      console.log(`🗑️  Emptied Plex trash for "${library.title}"`);
      return;
    }
  }
  console.warn(`Plex scan of "${library.title}" still running; skipped emptying Plex trash.`);
}
