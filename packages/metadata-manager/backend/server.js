import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { stat } from "fs/promises";
import { randomUUID } from "crypto";
import { getTrackArtwork } from "./services/fileMetadataReader.js";
import { getAllSettings, setSetting } from "./services/settingsService.js";
import { getItems, getItem, getAlbums, getAlbumTracks, getDuplicates, getStats } from "./services/beetsDb.js";
import { runScript, runBeet } from "./services/beetsRunner.js";

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

// Get duplicate tracks
app.get("/api/tracks/duplicates", (req, res) => {
  try {
    res.json({ groups: getDuplicates() });
  } catch (error) {
    console.error("Error fetching duplicates:", error);
    res.status(500).json({ error: "Failed to fetch duplicates" });
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
