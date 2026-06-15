/**
 * Favourites Wizard - swipe albums from a source library into a shortlist,
 * then copy their folders on disk to the destination library and trigger a scan.
 */

import path from "path";
import { mkdir, stat, access, cp, rm } from "fs/promises";
import { constants as fsConstants } from "fs";
import { prisma } from "../prisma/client.js";
import {
  getLibrarySection,
  getPlexAlbums,
  getAlbumLocation,
  getServerConnection,
} from "./plexClient.js";

// Fetch "everything" from a section in one call (getPlexAlbums paginates client-side).
const ALL_ALBUMS_LIMIT = 100000;

/** Normalise artist+title into a dedup key. */
export function normalizeKey(artist, title) {
  const clean = s =>
    String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  return `${clean(artist)}|${clean(title)}`;
}

// Destination album key sets are expensive to build (full section fetch), so cache
// them briefly. Invalidated after a copy run changes the destination.
const DEST_KEY_CACHE_TTL = 5 * 60 * 1000;
const destKeyCache = new Map(); // libraryId -> { keys: Set, at }

export function invalidateDestinationCache(libraryId = null) {
  if (libraryId) destKeyCache.delete(libraryId);
  else destKeyCache.clear();
}

/**
 * Set of normalized artist|title keys for every album in the destination library.
 * @param {Object} destLibrary - PlexLibrary row (with server + account)
 */
export async function getDestinationAlbumKeySet(destLibrary) {
  const cached = destKeyCache.get(destLibrary.id);
  if (cached && Date.now() - cached.at < DEST_KEY_CACHE_TTL) return cached.keys;

  const section = await getLibrarySection(destLibrary);
  const server = await getServerConnection(destLibrary.server);
  const { albums } = await getPlexAlbums(server, section, { limit: ALL_ALBUMS_LIMIT });
  const keys = new Set(albums.map(a => normalizeKey(a.artist, a.title)));
  destKeyCache.set(destLibrary.id, { keys, at: Date.now() });
  return keys;
}

/**
 * Album folder path relative to whichever section root contains it.
 * Falls back to the folder's basename when no root matches.
 * @param {string} albumPath - absolute album directory path
 * @param {Array<{path: string}>} sectionLocations - section.locations entries
 */
export function computeRelativeAlbumPath(albumPath, sectionLocations = []) {
  for (const loc of sectionLocations) {
    if (!loc?.path) continue;
    const rel = path.relative(loc.path, albumPath);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return rel;
    }
  }
  return path.basename(albumPath);
}

/**
 * Copy every shortlisted (KEEP + PENDING/FAILED) album folder for the pair to the
 * destination library root, then trigger a Plex scan of the destination section.
 * Mutates `state` (the server's favouritesCopyState) as it progresses.
 */
export async function runFavouritesCopy(state, sourceLibrary, destLibrary, rows) {
  const sourceSection = await getLibrarySection(sourceLibrary);
  const destSection = await getLibrarySection(destLibrary);

  const destRoot = destSection.locations?.[0]?.path;
  if (!destRoot) {
    throw new Error(`Destination library "${destLibrary.title}" has no folder location in Plex.`);
  }
  const destStat = await stat(destRoot).catch(() => null);
  if (!destStat?.isDirectory()) {
    throw new Error(`Destination folder "${destRoot}" is not accessible from this machine.`);
  }
  await access(destRoot, fsConstants.W_OK).catch(() => {
    throw new Error(`Destination folder "${destRoot}" is not writable.`);
  });

  const sourceServer = await getServerConnection(sourceLibrary.server);

  for (const row of rows) {
    if (state.shouldStop) break;

    state.current++;
    state.currentAlbum = { artist: row.artist, title: row.title };

    const result = { ratingKey: row.ratingKey, artist: row.artist, title: row.title };
    let status = null;
    let error = null;

    try {
      let srcPath = row.location;
      if (!srcPath) {
        srcPath = await getAlbumLocation(sourceServer, row.ratingKey);
      }
      if (!srcPath) {
        throw new Error("No folder location available for this album");
      }
      const srcStat = await stat(srcPath).catch(() => null);
      if (!srcStat?.isDirectory()) {
        throw new Error(`Source folder missing: ${srcPath}`);
      }

      const rel = computeRelativeAlbumPath(srcPath, sourceSection.locations);
      const destPath = path.join(destRoot, rel);

      const existing = await stat(destPath).catch(() => null);
      if (existing) {
        status = "SKIPPED_EXISTS";
      } else {
        await mkdir(path.dirname(destPath), { recursive: true });
        try {
          await cp(srcPath, destPath, { recursive: true, errorOnExist: true, force: false });
          status = "COPIED";
        } catch (copyErr) {
          // Don't leave a half-copied album behind
          await rm(destPath, { recursive: true, force: true }).catch(() => {});
          throw copyErr;
        }
      }
    } catch (err) {
      status = "FAILED";
      error = err.message;
      console.error(`❌ Favourites copy failed for "${row.artist} - ${row.title}":`, err.message);
    }

    await prisma.favouriteSwipe.update({
      where: { id: row.id },
      data: { copyStatus: status, copyError: error },
    });

    if (status === "COPIED") state.copied++;
    else if (status === "SKIPPED_EXISTS") state.skippedExists++;
    else state.failed++;

    state.results.push({ ...result, status, error });
  }

  state.currentAlbum = null;

  if (state.copied > 0) {
    try {
      await destSection.update(); // Plex: scan section for new files
      state.scanTriggered = true;
      console.log(`🔄 Triggered Plex scan of "${destLibrary.title}"`);
    } catch (err) {
      console.error("Failed to trigger destination library scan:", err.message);
    }
    invalidateDestinationCache(destLibrary.id);
  }
}
