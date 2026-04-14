import Database from "better-sqlite3";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_DB_PATH = join(homedir(), ".config", "beets", "library.db");

let db = null;

export function getDbPath() {
  return process.env.BEETS_DB_PATH || DEFAULT_DB_PATH;
}

export function dbExists() {
  return existsSync(getDbPath());
}

function getDb() {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) return null;
  if (!db) {
    db = new Database(dbPath, { readonly: true });
  }
  return db;
}

// Beets stores path as BLOB — this query casts it to TEXT
const BASE_SELECT = `
  SELECT
    id, CAST(path AS TEXT) as path, title, artist, artists, album,
    albumartist, genres, style, year, track, tracktotal, disc, disctotal,
    bpm, comp, length, bitrate, format, samplerate, bitdepth, channels,
    mb_trackid, mb_albumid, mb_artistid, label, comments, composer,
    initial_key, added, mtime
  FROM items
`;

const SORT_MAP = {
  added: "added",
  title: "title",
  year: "year",
  artist: "artist",
  genre: "genres",
  format: "format",
  album: "album",
  bpm: "bpm",
};

export function getItems({ page = 1, limit = 50, sort = "added", sortDirection = "desc", search = "" } = {}) {
  const db = getDb();
  if (!db) {
    return { items: [], pagination: { page, limit, total: 0, pages: 0, hasNext: false, hasPrev: false } };
  }
  const offset = (page - 1) * limit;
  const orderBy = SORT_MAP[sort] || "added";
  const direction = sortDirection === "asc" ? "ASC" : "DESC";

  let whereClause = "";
  let params = [];

  if (search) {
    whereClause = `WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR albumartist LIKE ? OR genres LIKE ?`;
    const term = `%${search}%`;
    params = [term, term, term, term, term];
  }

  const countSql = `SELECT COUNT(*) as total FROM items ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  const sql = `${BASE_SELECT} ${whereClause} ORDER BY ${orderBy} ${direction} LIMIT ? OFFSET ?`;
  const items = db.prepare(sql).all(...params, limit, offset);

  const pages = Math.ceil(total / limit);

  return {
    items: items.map(normalizeItem),
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    },
  };
}

export function getItem(id) {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(`${BASE_SELECT} WHERE id = ?`).get(id);
  return row ? normalizeItem(row) : null;
}

export function getAlbums({ page = 1, limit = 50, search = "" } = {}) {
  const db = getDb();
  if (!db) {
    return { albums: [], pagination: { page, limit, total: 0, pages: 0, hasNext: false, hasPrev: false } };
  }
  const offset = (page - 1) * limit;

  let whereClause = "";
  let params = [];

  if (search) {
    whereClause = "WHERE album LIKE ?";
    params = [`%${search}%`];
  }

  const countSql = `SELECT COUNT(DISTINCT album) as total FROM items ${whereClause}`;
  const { total } = db.prepare(countSql).get(...params);

  const sql = `
    SELECT album, COUNT(*) as trackCount, MIN(id) as artworkTrackId
    FROM items
    ${whereClause}
    GROUP BY album
    ORDER BY album
    LIMIT ? OFFSET ?
  `;
  const albums = db.prepare(sql).all(...params, limit, offset);

  const pages = Math.ceil(total / limit);

  return {
    albums,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    },
  };
}

export function getAlbumTracks(albumName) {
  const db = getDb();
  if (!db) return [];
  const sql = `${BASE_SELECT} WHERE album = ? ORDER BY track ASC, title ASC`;
  const items = db.prepare(sql).all(albumName);
  return items.map(normalizeItem);
}

export function getStats() {
  const db = getDb();
  if (!db) return { total: 0, withGenres: 0, withMbId: 0, formats: [], totalLengthSeconds: 0 };
  const total = db.prepare("SELECT COUNT(*) as n FROM items").get().n;
  const withGenres = db.prepare("SELECT COUNT(*) as n FROM items WHERE genres IS NOT NULL AND genres != ''").get().n;
  const withMbId = db.prepare("SELECT COUNT(*) as n FROM items WHERE mb_trackid IS NOT NULL AND mb_trackid != ''").get().n;
  const formats = db.prepare("SELECT format, COUNT(*) as count FROM items GROUP BY format ORDER BY count DESC").all();
  const totalLength = db.prepare("SELECT SUM(length) as n FROM items").get().n || 0;

  return {
    total,
    withGenres,
    withMbId,
    formats,
    totalLengthSeconds: totalLength,
  };
}

function normalizeItem(row) {
  return {
    ...row,
    addedAt: row.added ? new Date(row.added * 1000).toISOString() : null,
    modifiedAt: row.mtime ? new Date(row.mtime * 1000).toISOString() : null,
    durationSeconds: row.length || 0,
  };
}

/**
 * Get distinct year-level subfolder names from item paths.
 * E.g. paths like "/Volumes/T7/DJ Library/Singles/2015/file.mp3" → ["2015"]
 * Extracts the path segment immediately after the library root.
 */
export function getDistinctFolders(libraryPath) {
  const db = getDb();
  if (!db) return [];
  const prefix = libraryPath.replace(/\/+$/, "");
  const rows = db.prepare(`
    SELECT DISTINCT CAST(path AS TEXT) AS p
    FROM items
    WHERE p LIKE ? || '/%'
  `).all(prefix);
  const folders = new Set();
  for (const { p } of rows) {
    // Strip the prefix + "/", take everything up to the next "/"
    const rest = p.slice(prefix.length + 1);
    const slash = rest.indexOf("/");
    const folder = slash === -1 ? rest : rest.slice(0, slash);
    if (folder) folders.add(folder);
  }
  return [...folders].sort();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
