import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { stat, rm } from "fs/promises";
import { resolve as resolvePath } from "path";
import { randomUUID } from "crypto";
import { getTrackArtwork } from "./services/fileMetadataReader.js";
import { getAllSettings, getSetting, setSetting } from "./services/settingsService.js";
import { getItems, getItem, getAlbums, getAlbumTracks, getStats, closeDb } from "./services/beetsDb.js";
import { runScript, runBeet, runBeetStreaming } from "./services/beetsRunner.js";
import { setBeetsLibraryDirectory } from "./services/beetsConfig.js";
import { resetBeetsLibraryDb } from "./services/beetsLibrary.js";
import { listUnprocessedFiles } from "./services/unprocessedFiles.js";
import { parseDuplicatesOutput } from "./services/duplicatesParser.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// List albums (grouped by album field from beets)
app.get("/api/albums", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const search = req.query.search || "";

    const result = getAlbums({ page, limit, search });

    // Add artwork URL to each album group
    result.albums = result.albums.map((album) => ({
      ...album,
      artworkUrl: `/api/tracks/${album.artworkTrackId}/artwork`,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({ error: "Failed to fetch albums" });
  }
});

// Get tracks for a specific album
app.get("/api/albums/:name/tracks", (req, res) => {
  try {
    const albumName = req.params.name;
    const tracks = getAlbumTracks(albumName);

    if (tracks.length === 0) {
      return res.status(404).json({ error: "Album not found" });
    }

    // Add artwork URL to each track
    const tracksWithUrls = tracks.map((track) => ({
      ...track,
      artworkUrl: `/api/tracks/${track.id}/artwork`,
    }));

    res.json({ album: albumName, tracks: tracksWithUrls });
  } catch (error) {
    console.error("Error fetching album tracks:", error);
    res.status(500).json({ error: "Failed to fetch album tracks" });
  }
});

// Get all settings
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Update a setting
app.put("/api/settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ error: "Value is required" });
    }

    if (key === "musicLibraryPath") {
      const stats = await stat(value).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        return res.status(400).json({ error: "Path does not exist or is not a directory" });
      }
    }

    const setting = await setSetting(key, value);
    res.json({ setting: { key: setting.key, value: setting.value } });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

// ==========================================
// Tracks API (beets library)
// ==========================================

// List tracks with pagination, sorting, and search
app.get("/api/tracks", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const sort = req.query.sort || "added";
    const sortDirection = req.query.sortDirection || "desc";
    const search = req.query.search || "";

    const result = getItems({ page, limit, sort, sortDirection, search });

    // Add artwork URL to each track
    result.items = result.items.map((item) => ({
      ...item,
      artworkUrl: `/api/tracks/${item.id}/artwork`,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching tracks:", error);
    res.status(500).json({ error: "Failed to fetch tracks" });
  }
});

// Get library stats
app.get("/api/tracks/stats", (req, res) => {
  try {
    res.json(getStats());
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Get duplicate tracks via `beet duplicates -s --full`. Strict mode (`-s`)
// silently drops any item where any group key (albumartist/album/title/length)
// is empty, so untagged files from `-A` imports don't pollute the results.
// `--full` returns all items in each group (not just the non-canonical ones).
app.get("/api/beets/tracks/duplicates", async (req, res) => {
  try {
    // Tab delimiter — will never appear in a path/title/album. beets Template
    // passes `\t` through literally. Trailing `: <count>` suffix is hardcoded
    // by the duplicates plugin itself; the parser uses it to walk groups.
    const fmt = "$id\t$path\t$bitrate\t$format\t$length\t$added\t$artist\t$title\t$album";
    const result = await runBeet(["duplicates", "-s", "--full", "-f", fmt]);
    if (result.code !== 0) {
      return res.status(500).json({ error: result.stderr || `beet exited ${result.code}` });
    }
    res.json({ groups: parseDuplicatesOutput(result.stdout) });
  } catch (error) {
    console.error("Error fetching duplicates:", error);
    res.status(500).json({ error: "Failed to fetch duplicates" });
  }
});

// Delete tracks by id via `beet rm -d -f id:N ...`. `-d` removes files from
// disk; `-f` skips confirmation. Batched at 100 ids per invocation to stay
// under argv limits. Callers (the wizard) must release the readonly DB handle
// before we shell out, otherwise SQLite throws "database is locked".
app.post("/api/beets/tracks/delete", async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!ids.every((n) => Number.isInteger(n) && n > 0)) {
      return res.status(400).json({ error: "ids must be positive integers" });
    }
    closeDb();
    const chunks = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const deleted = [];
    const failed = [];
    for (const chunk of chunks) {
      const args = ["rm", "-d", "-f", ...chunk.map((id) => `id:${id}`)];
      try {
        const result = await runBeet(args);
        if (result.code === 0) {
          deleted.push(...chunk);
        } else {
          failed.push({ ids: chunk, error: result.stderr || `exit ${result.code}` });
        }
      } catch (err) {
        failed.push({ ids: chunk, error: err.message });
      }
    }
    res.json({ deleted, failed });
  } catch (error) {
    console.error("Error deleting tracks:", error);
    res.status(500).json({ error: "Failed to delete tracks" });
  }
});

// Get single track
app.get("/api/tracks/:id", (req, res) => {
  try {
    const item = getItem(parseInt(req.params.id));
    if (!item) {
      return res.status(404).json({ error: "Track not found" });
    }
    res.json({
      track: {
        ...item,
        artworkUrl: `/api/tracks/${item.id}/artwork`,
      },
    });
  } catch (error) {
    console.error("Error fetching track:", error);
    res.status(500).json({ error: "Failed to fetch track" });
  }
});

// Get track artwork
app.get("/api/tracks/:id/artwork", async (req, res) => {
  try {
    const item = getItem(parseInt(req.params.id));
    if (!item) {
      return res.status(404).json({ error: "Track not found" });
    }

    const artwork = await getTrackArtwork(item.path);
    if (!artwork) {
      return res.status(404).json({ error: "No artwork found" });
    }

    res.set("Content-Type", artwork.format);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(artwork.data);
  } catch (error) {
    console.error("Error fetching artwork:", error);
    res.status(500).json({ error: "Failed to fetch artwork" });
  }
});

// ==========================================
// Beets operations API
// ==========================================

// In-memory operation tracking
const operations = new Map();

// Run Claude genre tagger
app.post("/api/beets/genre-tag", async (req, res) => {
  try {
    const { query, dryRun } = req.body;
    const id = randomUUID();
    const args = [];
    if (dryRun) args.push("--dry-run");
    if (query) args.push(query);

    operations.set(id, { id, type: "genre-tag", status: "running", startedAt: new Date().toISOString() });

    res.json({ operationId: id, message: "Genre tagging started" });

    runScript("genre_tagger.py", args)
      .then((result) => {
        operations.set(id, {
          ...operations.get(id),
          status: result.code === 0 ? "completed" : "failed",
          output: result.stdout,
          error: result.stderr || undefined,
          completedAt: new Date().toISOString(),
        });
      })
      .catch((err) => {
        operations.set(id, {
          ...operations.get(id),
          status: "failed",
          error: err.message,
          completedAt: new Date().toISOString(),
        });
      });
  } catch (error) {
    console.error("Error starting genre tag:", error);
    res.status(500).json({ error: "Failed to start genre tagging" });
  }
});

// Run beet write (write tags to files)
app.post("/api/beets/write", async (req, res) => {
  try {
    const { query } = req.body;
    const id = randomUUID();
    const args = ["write"];
    if (query) args.push(query);

    operations.set(id, { id, type: "write", status: "running", startedAt: new Date().toISOString() });

    res.json({ operationId: id, message: "Write started" });

    runBeet(args)
      .then((result) => {
        operations.set(id, {
          ...operations.get(id),
          status: result.code === 0 ? "completed" : "failed",
          output: result.stdout,
          error: result.stderr || undefined,
          completedAt: new Date().toISOString(),
        });
      })
      .catch((err) => {
        operations.set(id, {
          ...operations.get(id),
          status: "failed",
          error: err.message,
          completedAt: new Date().toISOString(),
        });
      });
  } catch (error) {
    console.error("Error starting write:", error);
    res.status(500).json({ error: "Failed to start write" });
  }
});

// Get operation status
app.get("/api/beets/operations/:id", (req, res) => {
  const op = operations.get(req.params.id);
  if (!op) {
    return res.status(404).json({ error: "Operation not found" });
  }
  res.json(op);
});

// ==========================================
// Setup Wizard API
// ==========================================

// Helper: start a streaming beet operation and track it in the operations map.
function startStreamingBeetOp(type, args) {
  const id = randomUUID();
  operations.set(id, {
    id,
    type,
    status: "running",
    output: "",
    startedAt: new Date().toISOString(),
  });

  runBeetStreaming(args, (chunk) => {
    const current = operations.get(id);
    if (!current) return;
    operations.set(id, { ...current, output: (current.output || "") + chunk });
  })
    .then((result) => {
      const current = operations.get(id) || {};
      operations.set(id, {
        ...current,
        status: result.code === 0 ? "completed" : "failed",
        output: (current.output || "") + (result.stderr ? `\n${result.stderr}` : ""),
        error: result.code !== 0 ? result.stderr || `beet exited with code ${result.code}` : undefined,
        completedAt: new Date().toISOString(),
      });
    })
    .catch((err) => {
      const current = operations.get(id) || {};
      operations.set(id, {
        ...current,
        status: "failed",
        error: err.message,
        completedAt: new Date().toISOString(),
      });
    });

  return id;
}

// Setup status — frontend SetupGate polls this on load
app.get("/api/setup/status", async (req, res) => {
  try {
    const setupComplete = (await getSetting("setupComplete")) === "true";
    const libraryPath = await getSetting("musicLibraryPath");
    res.json({ setupComplete, libraryPath });
  } catch (error) {
    console.error("Error fetching setup status:", error);
    res.status(500).json({ error: "Failed to fetch setup status" });
  }
});

// Mark setup complete
app.post("/api/setup/complete", async (req, res) => {
  try {
    await setSetting("setupComplete", "true");
    await setSetting("lastImportAt", new Date().toISOString());
    res.json({ ok: true });
  } catch (error) {
    console.error("Error marking setup complete:", error);
    res.status(500).json({ error: "Failed to mark setup complete" });
  }
});

// Update beets config directory (called after user picks library path in wizard)
app.post("/api/beets/config/library-directory", async (req, res) => {
  try {
    const { directory } = req.body || {};
    if (!directory || typeof directory !== "string") {
      return res.status(400).json({ error: "directory is required" });
    }
    const stats = await stat(directory).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return res.status(400).json({ error: "Path does not exist or is not a directory" });
    }
    await setBeetsLibraryDirectory(directory);
    await setSetting("musicLibraryPath", directory);
    res.json({ ok: true, directory });
  } catch (error) {
    console.error("Error updating beets config:", error);
    res.status(500).json({ error: "Failed to update beets config" });
  }
});

// Wipe the beets library DB (destructive — caller must pass confirm: true)
app.post("/api/beets/library/reset", async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Must pass { confirm: true } to reset library" });
    }
    const { dbPath } = await resetBeetsLibraryDb();
    res.json({ ok: true, dbPath });
  } catch (error) {
    console.error("Error resetting library:", error);
    res.status(500).json({ error: "Failed to reset library" });
  }
});

// Start a beets import (async, streamed)
app.post("/api/beets/import", async (req, res) => {
  try {
    const { path: importPath } = req.body || {};
    if (!importPath) {
      return res.status(400).json({ error: "path is required" });
    }
    const stats = await stat(importPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return res.status(400).json({ error: "Path does not exist or is not a directory" });
    }
    // -A = no autotag (fast, offline). Quiet/non-interactive behavior is
    // enforced via import.quiet in ~/.config/beets/config.yaml (written by
    // setBeetsLibraryDirectory on the wizard's Library step).
    const id = startStreamingBeetOp("import", ["import", "-A", importPath]);
    res.json({ operationId: id, message: "Import started" });
  } catch (error) {
    console.error("Error starting import:", error);
    res.status(500).json({ error: "Failed to start import" });
  }
});

// Start a MusicBrainz re-tag pass over the existing library (async, streamed).
// `beet import -L` re-runs the import pipeline on library items instead of a
// filesystem path; with `quiet_fallback: asis` + `singletons: true` baked into
// the config (see beetsConfig.js), matched items get canonical MB metadata
// (DB + file tags, since `write: true`) and non-matches are left untouched.
// No query = retag everything. Slow: MB anonymous API rate-limits to ~1 req/s.
app.post("/api/beets/identify", async (req, res) => {
  try {
    // Release the readonly DB handle so beets can take the write lock for
    // updating matched items. Same pattern as the delete-tracks endpoint.
    closeDb();
    const id = startStreamingBeetOp("identify", ["import", "-L"]);
    res.json({ operationId: id, message: "Identify started" });
  } catch (error) {
    console.error("Error starting identify:", error);
    res.status(500).json({ error: "Failed to start identify" });
  }
});

// List audio files under path that aren't in the beets library
app.get("/api/beets/unprocessed", async (req, res) => {
  try {
    const libraryPath = req.query.path;
    if (!libraryPath) {
      return res.status(400).json({ error: "path query param is required" });
    }
    const files = await listUnprocessedFiles(libraryPath);
    res.json({ files });
  } catch (error) {
    console.error("Error listing unprocessed files:", error);
    res.status(500).json({ error: "Failed to list unprocessed files" });
  }
});

// Delete unprocessed files (only within the configured library path)
app.post("/api/beets/unprocessed/delete", async (req, res) => {
  try {
    const { paths } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: "paths array is required" });
    }
    const libraryPath = await getSetting("musicLibraryPath");
    if (!libraryPath) {
      return res.status(400).json({ error: "No library path configured" });
    }
    const root = resolvePath(libraryPath);
    const deleted = [];
    const failed = [];
    for (const p of paths) {
      const abs = resolvePath(p);
      // Path containment guard — only allow deletes inside the library root
      if (!abs.startsWith(root + "/") && abs !== root) {
        failed.push({ path: p, error: "outside library root" });
        continue;
      }
      try {
        await rm(abs, { force: true });
        deleted.push(abs);
      } catch (err) {
        failed.push({ path: p, error: err.message });
      }
    }
    res.json({ deleted, failed });
  } catch (error) {
    console.error("Error deleting unprocessed files:", error);
    res.status(500).json({ error: "Failed to delete files" });
  }
});

// Run a single beets plugin command (duplicates | scrub)
app.post("/api/beets/plugins/run", async (req, res) => {
  try {
    const { plugin } = req.body || {};
    const allowed = {
      // `-p` forces `$path: <count>` output. Without it, the default format is
      // `$artist - $album - $title: <count>`, which renders as `: <count>` for
      // libraries imported with `-A` (no autotag) because all tag fields are
      // empty — unreadable in the wizard log.
      duplicates: ["duplicates", "-p"],
      // `beet scrub` with no query matches all items via `lib.items([])`. There
      // is no `-a` flag — its only options are `-h` and `-W`.
      scrub: ["scrub"],
    };
    if (!plugin || !(plugin in allowed)) {
      return res.status(400).json({ error: `plugin must be one of: ${Object.keys(allowed).join(", ")}` });
    }
    const id = startStreamingBeetOp(`plugin:${plugin}`, allowed[plugin]);
    res.json({ operationId: id, message: `Plugin ${plugin} started` });
  } catch (error) {
    console.error("Error running plugin:", error);
    res.status(500).json({ error: "Failed to run plugin" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Metadata Manager backend running on http://localhost:${PORT}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill the process or use a different port.`);
    process.exit(1);
  }
  throw err;
});
