import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { stat, copyFile, writeFile, unlink } from "fs/promises";
import { existsSync, statSync, writeFileSync, unlinkSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import { prisma } from "./prisma/client.js";
import { scanAlbumMetadata } from "./services/metadata/metadataScanner.js";
import {
  getTorrentGroup,
  searchRedactedMultiStrategy,
  searchRedacted,
  searchRedactedAdvanced,
} from "./services/metadata/redacted.js";
import {
  testPlexConnection,
  getPlexAlbums,
  getPlexAlbum,
  getPlexAlbumArtworkUrls,
  getPlexGenres,
  clearPlexCache,
  getAlbumLocation,
  updatePlexAlbumAddedAt,
  getServerConnection,
  getLibrarySection,
  discoverServers,
  discoverLibraries,
} from "./services/plexClient.js";
import { scanPlexLibrary, getScanProgress, stopScan } from "./services/libraryScanner.js";
import { getAlbumMetadataMatches, recordMetadataMatch } from "./services/enhancementLayer.js";
import { readAlbumMetadataFromFiles, getEmbeddedArtwork } from "./services/fileMetadataReader.js";
import { writePlexMetadata } from "./services/plexMetadataWriter.js";
import { REDACTED } from "./constants/metadataServices.js";
import { fetchImage, embedArtworkToAlbum } from "./services/artwork/artworkManager.js";
import { syncAlbumToPlex } from "./services/syncService.js";
import { writePlexMetadataToFiles } from "./services/plexToFileWriter.js";
import { getImageDimensionsFromBuffer, isHdArtwork, HD_ARTWORK_MIN_SIZE } from "./services/imageDimensions.js";
import { IMPLEMENTED_PLEX_TO_FILE_FIELDS } from "./constants/plexToFileSyncableFields.js";
import { logSyncFailure, getRecentFailures, getFailureCounts, clearFailures } from "./services/failureLogger.js";

// Load environment variables - use test env file when NODE_ENV=test
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test", override: true });

  // Override MUSIC_LIBRARY_PATH with test temp directory if provided
  if (process.env.TEST_MUSIC_LIBRARY_PATH) {
    process.env.MUSIC_LIBRARY_PATH = process.env.TEST_MUSIC_LIBRARY_PATH;
    console.log(`🧪 Using test music library: ${process.env.MUSIC_LIBRARY_PATH}`);
  }
} else {
  // override: true ensures our .env wins over values pre-loaded by Prisma client
  dotenv.config({ override: true });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Debug: Log DATABASE_URL to verify correct env is loaded
console.log(`📊 Using DATABASE_URL: ${process.env.DATABASE_URL}`);


// Bulk metadata scan state (similar to library scan)
let bulkScanState = {
  isScanning: false,
  current: 0,
  total: 0,
  matched: 0,
  failed: 0,
  currentAlbum: null,
  shouldStop: false,
};

// In-memory store for pending Plex OAuth sessions
// { [id]: { webLogin, status: 'pending'|'approved'|'failed', account: null, error: null } }
const pendingPlexOAuthSessions = new Map();

// Bulk metadata sync state (for syncing matched albums to Plex)
let bulkSyncState = {
  isSyncing: false,
  current: 0,
  total: 0,
  synced: 0,
  failed: 0,
  currentAlbum: null,
  shouldStop: false,
  error: null,
  selectedFields: {},
};

// Bulk sync to files state (for syncing Plex metadata to local file tags)
let bulkSyncToFilesState = {
  isSyncing: false,
  current: 0,
  total: 0,
  synced: 0,
  failed: 0,
  repaired: 0,
  currentAlbum: null,
  shouldStop: false,
  error: null,
  selectedFields: {},
  corrupted: 0,
  corruptedFiles: [], // [{ album, file }]
  halted: false,
};

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: "50mb" })); // Increased limit for base64 artwork uploads

// Configure multer for artwork uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only accept JPEG and PNG images
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed"));
    }
  },
});

// Request logging middleware - log ALL requests
app.use((req, res, next) => {
  if (req.url.includes("/metadata/apply")) {
    console.log(`🔍 REQUEST: ${req.method} ${req.url}`);
    console.log(`🔍 Headers:`, req.headers);
    console.log(`🔍 Body:`, req.body);
  }
  next();
});

// Active library middleware - attaches req.library / req.server from header or DB
import { activeLibraryMiddleware, invalidateLibraryCache, loadLibrary } from "./middleware/activeLibrary.js";
import {
  getDestinationAlbumKeySet,
  normalizeKey,
  runFavouritesCopy,
} from "./services/favouritesWizard.js";
import { runDeletion } from "./services/deletionWizard.js";
app.use(activeLibraryMiddleware);

// Resolve the connected Plex server for the request's active library.
// Throws a 409 if no library/server is configured or selected.
async function activeServer(req) {
  if (!req.server) {
    throw Object.assign(new Error("No active Plex library selected"), { statusCode: 409 });
  }
  return getServerConnection(req.server);
}

// Reduce a Prisma/SQLite error blob to a short human-readable reason. The raw
// messages are multi-line Rust-flavoured dumps (ConnectorError { ... }) that are
// useless to show in the UI.
function describeDatabaseError(err) {
  const raw = err?.message || "";
  const sqliteMessage = raw.match(/message: Some\("([^"]+)"\)/)?.[1] || null;

  if (sqliteMessage === "database disk image is malformed") {
    return "the database file became unreadable — this usually means the drive holding it was disconnected";
  }
  if (/unable to open/i.test(raw) || err?.code === "P1003" || err?.code === "P1000") {
    return "the database file can't be opened — check the drive it lives on is mounted";
  }
  return (
    sqliteMessage ||
    raw.split("\n").map(line => line.trim()).filter(Boolean)[0] ||
    "database unreachable"
  );
}

// Health check endpoint. Also probes the database so the frontend can tell
// "backend down" apart from "backend up but DB unreachable" (e.g. the external
// drive holding the SQLite file was unplugged). The probe reads a real table:
// after a drive remount the stale file handle still answers `SELECT 1` but
// fails on actual pages. On failure the Prisma connection is reset so the next
// query reopens the file — the app self-heals once the drive is back.
app.get("/health", async (req, res) => {
  let database = "ok";
  let databaseError = null;
  try {
    await prisma.plexLibrary.count();
  } catch (err) {
    database = "error";
    databaseError = describeDatabaseError(err);
    prisma.$disconnect().catch(() => {});
  }
  res.json({
    status: "ok",
    message: "Music Tagger API is running",
    database,
    databaseError,
    timestamp: new Date().toISOString(),
  });
});

// Plex connection test endpoint
app.get("/api/plex/test", async (req, res) => {
  try {
    console.log("Testing Plex connection...");
    if (!req.library) {
      return res.status(409).json({ success: false, error: "No active Plex library selected" });
    }
    const result = await testPlexConnection(req.library);

    if (result.connected) {
      res.json({
        success: true,
        ...result,
      });
    } else {
      res.status(500).json({
        success: false,
        ...result,
      });
    }
  } catch (error) {
    console.error("Plex connection test error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to connect to Plex server",
    });
  }
});

// Library scan endpoint - Start scan in background
app.post("/api/library/scan", async (req, res) => {
  try {
    const progress = getScanProgress();
    if (progress.isScanning) {
      return res.status(409).json({
        success: false,
        error: "Scan already in progress",
        message: "Scan already in progress",
      });
    }

    if (!req.library) {
      return res.status(409).json({
        success: false,
        error: "No active Plex library selected",
        message: "Select a library before scanning",
      });
    }

    console.log("🔄 Starting Plex library scan in background...");

    // Start scan in background (don't await)
    scanPlexLibrary(req.library).catch(error => {
      console.error("Background scan error:", error);
    });

    // Return immediately
    res.json({
      success: true,
      message: "Library scan started",
    });
  } catch (error) {
    console.error("Failed to start library scan:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to start library scan",
    });
  }
});

// Get scan progress endpoint
app.get("/api/library/scan/progress", (req, res) => {
  try {
    const progress = getScanProgress();
    res.json(progress);
  } catch (error) {
    console.error("Error getting scan progress:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Stop scan endpoint
app.delete("/api/library/scan", (req, res) => {
  try {
    stopScan();
    res.json({
      success: true,
      message: "Stopping scan...",
    });
  } catch (error) {
    console.error("Error stopping scan:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Scan all available libraries sequentially
app.post("/api/library/scan-all", async (req, res) => {
  try {
    const progress = getScanProgress();
    if (progress.isScanning) {
      return res.status(409).json({
        success: false,
        error: "Scan already in progress",
        message: "Scan already in progress",
      });
    }

    const libraries = await prisma.plexLibrary.findMany({
      where: { isEnabled: true },
      include: { server: { include: { account: true } } },
      orderBy: [{ server: { name: "asc" } }, { title: "asc" }],
    });
    if (libraries.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No libraries configured",
      });
    }

    const labels = libraries.map(l => `${l.server.name} ▸ ${l.title}`);
    console.log(`🔄 Starting scan for ${libraries.length} libraries: ${labels.join(", ")}`);

    // Scan each library sequentially in background
    (async () => {
      for (const lib of libraries) {
        const currentProgress = getScanProgress();
        if (currentProgress.shouldStop) break;
        try {
          await scanPlexLibrary(lib);
        } catch (error) {
          console.error(`Scan error for library "${lib.title}":`, error);
        }
      }
    })().catch(error => {
      console.error("Background scan-all error:", error);
    });

    res.json({
      success: true,
      message: `Scanning ${libraries.length} libraries: ${labels.join(", ")}`,
    });
  } catch (error) {
    console.error("Failed to start scan-all:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Bulk metadata scan endpoint - Start scan in background
app.post("/api/albums/bulk-metadata-scan", async (req, res) => {
  try {
    // Check if already scanning
    if (bulkScanState.isScanning) {
      return res.status(409).json({
        success: false,
        error: "Bulk scan already in progress",
      });
    }

    if (!req.library) {
      return res.status(409).json({ success: false, error: "No active Plex library selected" });
    }

    const minConfidence = req.body.minConfidence || 85;
    const includeMatched = req.body.includeMatched || false;
    console.log(`🔍 Starting bulk metadata scan (min confidence: ${minConfidence}%)...`);

    // Capture the active library + connected server for the background task.
    const libraryId = req.library.id;
    const server = await activeServer(req);

    // Reset state
    bulkScanState = {
      isScanning: true,
      current: 0,
      total: 0,
      matched: 0,
      failed: 0,
      currentAlbum: null,
      shouldStop: false,
    };

    // Start scan in background (don't await)
    (async () => {
      try {
        // Get database statistics
        const stats = await prisma.album.groupBy({
          by: ['matchStatus'],
          _count: { matchStatus: true }
        });

        console.log(`\n📊 Album Database Status:`);
        stats.forEach(s => {
          console.log(`   ${s.matchStatus || 'NULL'}: ${s._count.matchStatus}`);
        });

        // Fetch albums to process (unmatched only, or all if includeMatched=true)
        const whereClause = includeMatched ? { libraryId } : { matchStatus: "UNMATCHED", libraryId };
        const albumsToProcess = await prisma.album.findMany({
          where: whereClause,
          select: {
            id: true,
            plexRatingKey: true,
          },
        });

        bulkScanState.total = albumsToProcess.length;

        console.log(`\n⚙️  Bulk Scan Configuration:`);
        console.log(`   Min confidence threshold: ${minConfidence}%`);
        console.log(`   Scope: ${includeMatched ? 'ALL albums' : 'UNMATCHED albums only'}`);
        console.log(`   Total to process: ${bulkScanState.total}\n`);

        // Process each album
        for (const album of albumsToProcess) {
          // Check if should stop
          if (bulkScanState.shouldStop) {
            console.log("⏹️  Bulk scan stopped by user");
            break;
          }

          bulkScanState.current++;

          try {
            // Fetch live Plex data (same as individual search) for accurate metadata
            const plexAlbum = await getPlexAlbum(server, album.plexRatingKey);

            if (!plexAlbum) {
              console.log(`❌ Could not fetch Plex data for album ${album.id}`);
              bulkScanState.failed++;
              continue;
            }

            bulkScanState.currentAlbum = {
              id: album.id,
              title: plexAlbum.title,
              artist: plexAlbum.artist,
            };

            console.log(
              `\n[${bulkScanState.current}/${bulkScanState.total}] Scanning: ${plexAlbum.artist} - ${plexAlbum.title}`
            );

            // Extract track artists (critical for Various Artists albums)
            const trackArtists = plexAlbum.tracks
              ? [
                  ...new Set(
                    plexAlbum.tracks.map(t => t.originalTitle || t.grandparentTitle).filter(Boolean)
                  ),
                ]
              : [];

            // Search using EXACT same data as individual search
            const searchResults = await searchRedactedMultiStrategy({
              albumArtist: plexAlbum.artist,
              albumArtistCredit: plexAlbum.artistCredit,
              albumArtistSort: plexAlbum.artistSort,
              trackArtists: trackArtists,
              title: plexAlbum.title,
              titleDisambig: plexAlbum.titleDisambig,
              year: plexAlbum.year,
            });

            // Pick best result (first in array, already sorted by confidence)
            const bestResult = searchResults[0];

            // Log decision
            console.log(`\n[${bulkScanState.current}/${bulkScanState.total}] "${plexAlbum.title}" by "${plexAlbum.artist}"`);

            // Check if confidence meets threshold
            if (bestResult && bestResult.confidence >= minConfidence) {
              console.log(`   ✅ AUTO-MATCH: ${bestResult.confidence}% >= ${minConfidence}% threshold`);
              console.log(`   → Recording Redacted groupId ${bestResult.groupId}`);

              // Record the match (same as individual match)
              await recordMetadataMatch(album.plexRatingKey, "redacted", bestResult.groupId, libraryId);
              bulkScanState.matched++;
            } else if (bestResult) {
              console.log(`   ⚠️  SKIP (low confidence): ${bestResult.confidence}% < ${minConfidence}% threshold`);
              console.log(`   → No match recorded, album remains ${plexAlbum.matchStatus || 'UNMATCHED'}`);
            } else {
              console.log(`   ❌ SKIP (no results found)`);
              console.log(`   → No match recorded, album remains ${plexAlbum.matchStatus || 'UNMATCHED'}`);
              bulkScanState.failed++;
            }
          } catch (error) {
            console.error(
              `❌ Error scanning album ${album.id} (${album.plexRatingKey}):`,
              error.message
            );
            bulkScanState.failed++;

            // Log failure to database for review
            await logSyncFailure(album.id, "bulk_scan", error, {
              plexRatingKey: album.plexRatingKey,
              title: album.title,
              artist: album.artist,
            });
          }
        }

        // Scan complete - detailed summary
        const totalProcessed = bulkScanState.current;
        const skipped = totalProcessed - bulkScanState.matched - bulkScanState.failed;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 BULK SCAN COMPLETE`);
        console.log(`${'='.repeat(60)}`);
        console.log(`Total albums processed: ${totalProcessed}`);
        console.log(`✅ Auto-matched (>= ${minConfidence}%): ${bulkScanState.matched}`);
        console.log(`⚠️  Skipped (low confidence): ${skipped}`);
        console.log(`❌ Failed (errors): ${bulkScanState.failed}`);
        if (!includeMatched) {
          console.log(`ℹ️  Excluded (already matched): Not counted - only UNMATCHED albums were processed`);
        } else {
          console.log(`ℹ️  Scope: ALL albums (including previously matched)`);
        }
        console.log(`${'='.repeat(60)}\n`);

        bulkScanState.isScanning = false;
        bulkScanState.currentAlbum = null;
      } catch (error) {
        console.error("Bulk scan error:", error);
        bulkScanState.isScanning = false;
        bulkScanState.currentAlbum = null;
      }
    })();

    // Return immediately
    res.json({
      success: true,
      message: "Bulk metadata scan started",
    });
  } catch (error) {
    console.error("Failed to start bulk scan:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to start bulk scan",
    });
  }
});

// Get bulk scan progress endpoint
app.get("/api/albums/bulk-metadata-scan/progress", (req, res) => {
  try {
    res.json(bulkScanState);
  } catch (error) {
    console.error("Error getting bulk scan progress:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Stop bulk scan endpoint
app.delete("/api/albums/bulk-metadata-scan", (req, res) => {
  try {
    if (bulkScanState.isScanning) {
      bulkScanState.shouldStop = true;
      res.json({
        success: true,
        message: "Stopping bulk scan...",
      });
    } else {
      res.json({
        success: true,
        message: "No bulk scan in progress",
      });
    }
  } catch (error) {
    console.error("Error stopping bulk scan:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ===== BULK SYNC ENDPOINTS =====
// Start bulk sync - syncs all MATCHED albums to Plex

app.post("/api/albums/bulk-sync", async (req, res) => {
  try {
    if (bulkSyncState.isSyncing) {
      return res.status(409).json({
        success: false,
        error: "Bulk sync already in progress",
      });
    }

    const { selectedFields } = req.body;

    if (!selectedFields || !Object.values(selectedFields).some((v) => v)) {
      return res.status(400).json({
        success: false,
        error: "At least one field must be selected for sync",
      });
    }

    if (!req.library) {
      return res.status(409).json({ success: false, error: "No active Plex library selected" });
    }
    const libraryId = req.library.id;
    const server = await activeServer(req);

    // Reset state
    bulkSyncState = {
      isSyncing: true,
      current: 0,
      total: 0,
      synced: 0,
      failed: 0,
      currentAlbum: null,
      shouldStop: false,
      error: null,
      selectedFields,
    };

    // Start sync in background (async IIFE)
    (async () => {
      try {
        // Fetch MATCHED albums with a Redacted match via the metadataMatches relation
        // First, get the Redacted service ID
        const redactedService = await prisma.metadataService.findUnique({
          where: { name: REDACTED },
        });

        if (!redactedService) {
          throw new Error("Redacted metadata service not found in database");
        }

        const albumsToSync = await prisma.album.findMany({
          where: {
            matchStatus: "MATCHED",
            libraryId,
            metadataMatches: {
              some: {
                metadataServiceId: redactedService.id,
              },
            },
          },
          select: {
            id: true,
            plexRatingKey: true,
            title: true,
            artist: true,
            metadataMatches: {
              where: {
                metadataServiceId: redactedService.id,
              },
              select: {
                externalId: true,
              },
            },
          },
        });

        bulkSyncState.total = albumsToSync.length;
        console.log(`\n🔄 Starting bulk sync for ${bulkSyncState.total} albums...`);
        console.log(`   Selected fields:`, Object.keys(selectedFields).filter(k => selectedFields[k]));

        for (const album of albumsToSync) {
          if (bulkSyncState.shouldStop) {
            console.log("Bulk sync stopped by user");
            break;
          }

          bulkSyncState.current++;
          bulkSyncState.currentAlbum = {
            id: album.id,
            title: album.title,
            artist: album.artist,
          };

          // Get Redacted ID from the matched metadata service
          const redactedMatch = album.metadataMatches[0];
          if (!redactedMatch) {
            console.log(`   ⚠️ No Redacted match found, skipping`);
            continue;
          }
          const redactedId = redactedMatch.externalId;

          try {
            // 1. Fetch Redacted data for this album
            console.log(`\n[${bulkSyncState.current}/${bulkSyncState.total}] Syncing: ${album.artist} - ${album.title}`);
            const redactedData = await getTorrentGroup(parseInt(redactedId));

            if (!redactedData) {
              throw new Error("Failed to fetch Redacted data");
            }

            // 2. Build metadata diff based on selected fields
            const metadata = {};

            if (selectedFields.coverUrl && redactedData.coverUrl) {
              metadata.coverUrl = redactedData.coverUrl;
            }
            if (selectedFields.title && redactedData.title) {
              metadata.title = redactedData.title;
            }
            if (selectedFields.artist && redactedData.artist) {
              metadata.artist = redactedData.artist;
            }
            if (selectedFields.year && redactedData.year) {
              metadata.year = redactedData.year;
            }
            if (selectedFields.tags && redactedData.tags?.length > 0) {
              metadata.tags = redactedData.tags;
            }
            if (selectedFields.label && redactedData.label) {
              metadata.label = redactedData.label;
            }
            if (selectedFields.catalogNumber && redactedData.catalogNumber) {
              metadata.catalogNumber = redactedData.catalogNumber;
            }

            // 3. Use shared syncAlbumToPlex service (same as individual sync)
            // Pass selectedFields to track which fields were synced in database
            const syncResult = await syncAlbumToPlex(album.plexRatingKey, metadata, { selectedFields, libraryId, server });
            if (!syncResult.success) {
              throw new Error(syncResult.error || "Failed to sync to Plex");
            }

            bulkSyncState.synced++;
            console.log(`   ✅ Synced successfully`);

            // Add delay between syncs to avoid Plex rate limiting
            // Plex.tv auth endpoint has strict rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));

          } catch (error) {
            // STOP ON FIRST ERROR - log to database for review
            console.error(`   ❌ Error: ${error.message}`);
            bulkSyncState.failed++;
            bulkSyncState.error = `Failed to sync "${album.artist} - ${album.title}": ${error.message}`;

            // Log failure to database with full context
            await logSyncFailure(album.id, "bulk_sync_plex", error, {
              plexRatingKey: album.plexRatingKey,
              title: album.title,
              artist: album.artist,
              selectedFields,
              redactedGroupId: redactedMatch?.externalId,
            });

            bulkSyncState.shouldStop = true; // Stop the loop
            break;
          }
        }

        bulkSyncState.isSyncing = false;
        bulkSyncState.currentAlbum = null;
        console.log(`\n🏁 Bulk sync complete. Synced: ${bulkSyncState.synced}, Failed: ${bulkSyncState.failed}`);

      } catch (error) {
        console.error("Bulk sync error:", error);
        bulkSyncState.isSyncing = false;
        bulkSyncState.error = error.message;
      }
    })();

    res.json({ success: true, message: "Bulk sync started" });

  } catch (error) {
    console.error("Failed to start bulk sync:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get bulk sync progress
app.get("/api/albums/bulk-sync/progress", (req, res) => {
  try {
    res.json(bulkSyncState);
  } catch (error) {
    console.error("Error getting bulk sync progress:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Stop bulk sync
app.delete("/api/albums/bulk-sync", (req, res) => {
  try {
    if (bulkSyncState.isSyncing) {
      bulkSyncState.shouldStop = true;
      res.json({
        success: true,
        message: "Stopping bulk sync...",
      });
    } else {
      res.json({
        success: true,
        message: "No bulk sync in progress",
      });
    }
  } catch (error) {
    console.error("Error stopping bulk sync:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// BULK SYNC TO FILES (Plex → Local File Tags)
// ============================================

// Start bulk sync to files
app.post("/api/albums/bulk-sync-to-files", async (req, res) => {
  try {
    // Check if already syncing
    if (bulkSyncToFilesState.isSyncing) {
      return res.status(409).json({
        success: false,
        error: "Bulk sync to files already in progress",
      });
    }

    const { selectedFields, resync } = req.body;

    if (!selectedFields || !Object.values(selectedFields).some((v) => v)) {
      return res.status(400).json({
        success: false,
        error: "At least one field must be selected",
      });
    }

    if (!req.library) {
      return res.status(409).json({ success: false, error: "No active Plex library selected" });
    }
    const libraryId = req.library.id;
    const server = await activeServer(req);

    // Reset state
    bulkSyncToFilesState = {
      isSyncing: true,
      current: 0,
      total: 0,
      synced: 0,
      failed: 0,
      repaired: 0,
      currentAlbum: null,
      shouldStop: false,
      error: null,
      selectedFields,
      corrupted: 0,
      corruptedFiles: [],
      halted: false,
    };

    // Run async - don't await
    (async () => {
      try {
        // Get albums to sync based on resync flag
        const albumsToSync = await prisma.album.findMany({
          where: {
            matchStatus: 'SYNCED',  // Must be synced from Redacted to Plex
            libraryId,
            ...(resync
              ? { plexFileSync: { isNot: null } }  // Re-sync: already synced to files
              : { plexFileSync: null }              // Initial sync: not yet synced to files
            ),
          },
          orderBy: { createdAt: "desc" },
        });

        bulkSyncToFilesState.total = albumsToSync.length;
        console.log(`\n🔄 Starting bulk sync to files for ${bulkSyncToFilesState.total} albums...`);
        console.log(`   Selected fields:`, Object.keys(selectedFields).filter(k => selectedFields[k]));

        for (const album of albumsToSync) {
          if (bulkSyncToFilesState.shouldStop) {
            console.log("Bulk sync to files stopped by user");
            break;
          }

          bulkSyncToFilesState.current++;
          bulkSyncToFilesState.currentAlbum = {
            id: album.plexRatingKey,
            title: album.title,
            artist: album.artist,
          };

          let writeResult;
          try {
            console.log(`\n[${bulkSyncToFilesState.current}/${bulkSyncToFilesState.total}] Syncing to files: ${album.artist} - ${album.title}`);

            // Get full Plex album data
            const plexAlbum = await getPlexAlbum(server, album.plexRatingKey);
            if (!plexAlbum) {
              throw new Error("Failed to fetch Plex album data");
            }

            // Write metadata to files
            writeResult = await writePlexMetadataToFiles(
              album.filePath,
              plexAlbum,
              selectedFields
            );

            // Corruption detection takes priority over ordinary failure:
            // halt the whole bulk run so nothing else gets touched.
            if (writeResult.corruptedFiles && writeResult.corruptedFiles.length > 0) {
              for (const file of writeResult.corruptedFiles) {
                bulkSyncToFilesState.corruptedFiles.push({
                  albumId: album.id,
                  plexRatingKey: album.plexRatingKey,
                  albumTitle: album.title,
                  albumArtist: album.artist,
                  file,
                });
              }
              bulkSyncToFilesState.corrupted += writeResult.corruptedFiles.length;
              bulkSyncToFilesState.failed++;
              bulkSyncToFilesState.halted = true;
              bulkSyncToFilesState.shouldStop = true;
              bulkSyncToFilesState.error = `CORRUPTION DETECTED in "${album.artist} - ${album.title}" — bulk sync halted`;
              console.error(`\n🚨 Bulk sync halted: corruption in ${writeResult.corruptedFiles.length} file(s) of "${album.artist} - ${album.title}"`);
              break;
            }

            if (!writeResult.success) {
              throw new Error(writeResult.errors?.join(", ") || "Failed to write to files");
            }

            // Record sync in database (upsert handles both initial sync and re-sync)
            await prisma.plexFileSync.upsert({
              where: { albumId: album.id },
              create: {
                albumId: album.id,
                syncedFields: JSON.stringify(selectedFields),
                lastSyncedAt: new Date(),
              },
              update: {
                syncedFields: JSON.stringify(selectedFields),
                lastSyncedAt: new Date(),
              },
            });

            bulkSyncToFilesState.synced++;
            bulkSyncToFilesState.repaired += writeResult.filesRepaired || 0;
            console.log(`   ✅ Synced ${writeResult.filesUpdated} files successfully${writeResult.filesRepaired ? ` (${writeResult.filesRepaired} repaired)` : ""}`);

            // Add delay between syncs to avoid overwhelming file system
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            // LOG + CONTINUE. Corruption halt above is the only thing
            // that stops the bulk run. Ordinary per-album failures get
            // persisted to SyncFailure so the user can review them on
            // /sync-failures?operation=bulk_sync_files after the run.
            console.error(`   ❌ Error: ${error.message}`);

            await logSyncFailure(album.id, "bulk_sync_files", error, {
              filePath: album.filePath,
              plexRatingKey: album.plexRatingKey,
              albumTitle: album.title,
              albumArtist: album.artist,
              selectedFields,
              filesProcessed: writeResult?.filesProcessed,
              filesFailed: writeResult?.filesFailed,
              perFileErrors: writeResult?.errors,
            });

            bulkSyncToFilesState.failed++;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
        }

        bulkSyncToFilesState.isSyncing = false;
        bulkSyncToFilesState.currentAlbum = null;
        console.log(`\n🏁 Bulk sync to files complete. Synced: ${bulkSyncToFilesState.synced}, Failed: ${bulkSyncToFilesState.failed}`);

      } catch (error) {
        console.error("Bulk sync to files error:", error);
        bulkSyncToFilesState.isSyncing = false;
        bulkSyncToFilesState.error = error.message;
      }
    })();

    res.json({ success: true, message: "Bulk sync to files started" });

  } catch (error) {
    console.error("Failed to start bulk sync to files:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get bulk sync to files progress
app.get("/api/albums/bulk-sync-to-files/progress", (req, res) => {
  try {
    res.json(bulkSyncToFilesState);
  } catch (error) {
    console.error("Error getting bulk sync to files progress:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Stop bulk sync to files
app.delete("/api/albums/bulk-sync-to-files", (req, res) => {
  try {
    if (bulkSyncToFilesState.isSyncing) {
      bulkSyncToFilesState.shouldStop = true;
      res.json({
        success: true,
        message: "Stopping bulk sync to files...",
      });
    } else {
      res.json({
        success: true,
        message: "No bulk sync to files in progress",
      });
    }
  } catch (error) {
    console.error("Error stopping bulk sync to files:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get Plex albums with filters
app.get("/api/plex/albums", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const unmatched =
      req.query.unmatched === "true" ? true : req.query.unmatched === "false" ? false : null;
    const matched =
      req.query.matched === "true" ? true : req.query.matched === "false" ? false : null;
    const genre = req.query.genre || null;
    const addedAfter = req.query.addedAfter ? parseInt(req.query.addedAfter) : null;
    const updatedAfter = req.query.updatedAfter ? parseInt(req.query.updatedAfter) : null;
    const sort = req.query.sort || null;
    const sortDirection = req.query.sortDirection || "desc";

    const server = await activeServer(req);
    const section = await getLibrarySection(req.library);
    const result = await getPlexAlbums(server, section, {
      page,
      limit,
      unmatched,
      matched,
      genre,
      addedAfter,
      updatedAfter,
      sort,
      sortDirection,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching Plex albums:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get single Plex album
app.get("/api/plex/albums/:id", async (req, res) => {
  try {
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, req.params.id);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    res.json({
      success: true,
      album,
    });
  } catch (error) {
    console.error("Error fetching Plex album:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get Plex genres
app.get("/api/plex/genres", async (req, res) => {
  try {
    const section = await getLibrarySection(req.library);
    const genres = await getPlexGenres(section);

    res.json({
      success: true,
      genres,
    });
  } catch (error) {
    console.error("Error fetching Plex genres:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Restore Plex "Date Added" from folder birthtimes
app.post("/api/plex/restore-dates", async (req, res) => {
  const { albumIds } = req.body;

  if (!albumIds || !Array.isArray(albumIds) || albumIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: "albumIds must be a non-empty array of Plex rating keys",
    });
  }

  const results = [];
  const server = await activeServer(req);

  for (const albumId of albumIds) {
    try {
      // Get the album's directory path
      const location = await getAlbumLocation(server, albumId);
      if (!location) {
        results.push({ albumId, success: false, error: "Could not determine album location" });
        continue;
      }

      // Get folder birthtime (creation date)
      const stats = await stat(location);
      const birthtime = stats.birthtime;
      const birthtimeUnix = Math.floor(birthtime.getTime() / 1000);

      // Update Plex addedAt
      const result = await updatePlexAlbumAddedAt(server, albumId, birthtimeUnix);
      result.folderPath = location;
      result.folderBirthtime = birthtime.toISOString();
      results.push({ ...result, success: true });
    } catch (error) {
      console.error(`Error restoring date for album ${albumId}:`, error);
      results.push({ albumId, success: false, error: error.message });
    }
  }

  res.json({
    success: true,
    results,
    summary: {
      total: albumIds.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    },
  });
});

// Individual album endpoint
app.get("/api/albums/:id", async (req, res) => {
  try {
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, req.params.id);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    // Fetch metadata matches from enhancement layer
    const metadataMatches = await getAlbumMetadataMatches(req.params.id, req.library.id);
    album.metadataMatches = metadataMatches;

    // Fetch sync status from plex_file_syncs table (Plex → Files sync tracking)
    const syncRecord = await prisma.plexFileSync.findUnique({
      where: { albumId: req.params.id },
      select: { syncedFields: true, lastSyncedAt: true },
    });

    if (syncRecord) {
      try {
        album.syncedFields = JSON.parse(syncRecord.syncedFields);
        album.lastSyncedAt = syncRecord.lastSyncedAt;
      } catch (e) {
        album.syncedFields = null;
        album.lastSyncedAt = null;
      }
    } else {
      album.syncedFields = null;
      album.lastSyncedAt = null;
    }

    // Fetch sync status from redacted_plex_syncs table (Redacted → Plex sync tracking)
    const redactedSyncRecord = await prisma.redactedPlexSync.findUnique({
      where: { albumId: req.params.id },
      select: { syncedFields: true, lastSyncedAt: true },
    });

    if (redactedSyncRecord) {
      try {
        album.redactedSyncedFields = JSON.parse(redactedSyncRecord.syncedFields);
        album.redactedLastSyncedAt = redactedSyncRecord.lastSyncedAt;
      } catch (e) {
        album.redactedSyncedFields = null;
        album.redactedLastSyncedAt = null;
      }
    } else {
      album.redactedSyncedFields = null;
      album.redactedLastSyncedAt = null;
    }

    res.json({
      success: true,
      album,
    });
  } catch (error) {
    console.error("Error fetching album:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get file metadata for an album (reads actual ID3/Vorbis tags from files)
app.get("/api/albums/:id/file-metadata", async (req, res) => {
  try {
    const albumId = req.params.id;

    // Get album from Plex to get file location
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    if (!album.location) {
      return res.status(404).json({
        success: false,
        error: "Album location not available",
      });
    }

    // Read metadata from actual audio files
    const fileMetadata = await readAlbumMetadataFromFiles(album.location);

    if (!fileMetadata) {
      return res.status(404).json({
        success: false,
        error: "Could not read file metadata",
      });
    }

    res.json({
      success: true,
      metadata: fileMetadata,
    });
  } catch (error) {
    console.error("Error fetching file metadata:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get detailed Redacted torrent group metadata
app.get("/api/metadata/redacted/:groupId", async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);

    console.log(`Fetching Redacted torrent group ${groupId}`);

    const groupData = await getTorrentGroup(groupId);

    if (!groupData) {
      return res.status(404).json({
        success: false,
        error: "Torrent group not found",
      });
    }

    res.json({
      success: true,
      data: groupData,
    });
  } catch (error) {
    console.error("Error fetching torrent group:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch torrent group",
    });
  }
});

// Match album to metadata service (no Plex update)
app.post("/api/albums/:id/metadata/match", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { service, groupId } = req.body;

    console.log(`\n=== Match Album Request ===`);
    console.log(`Album ID: ${albumId}`);
    console.log(`Service: ${service}`);
    console.log(`Group ID: ${groupId}`);

    // Validate inputs
    if (!service || !groupId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: service and groupId",
      });
    }

    // Record the match (updates matchStatus to MATCHED)
    const result = await recordMetadataMatch(albumId, service, groupId, req.library.id);

    if (result.success) {
      res.json({
        success: true,
        message: "Album matched successfully",
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error("Error matching album:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Apply metadata to Plex
app.post("/api/albums/:id/metadata/apply", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { metadata } = req.body;

    console.log(`\n=== Apply Metadata Request ===`);
    console.log(`Album ID: ${albumId}`);
    console.log(`Metadata: ${metadata?.artist} - ${metadata?.title} (${metadata?.year})`);

    if (!metadata) {
      return res.status(400).json({
        success: false,
        error: "Metadata object is required",
      });
    }

    // Get album from Plex to get file location
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    const results = { plex: null };

    try {
      // Build selectedFields from metadata to track which fields were synced
      const selectedFields = {
        title: metadata.title !== undefined,
        artist: metadata.artist !== undefined,
        year: metadata.year !== undefined,
        tags: metadata.tags !== undefined,
        label: metadata.label !== undefined,
        artwork: metadata.coverUrl !== undefined,
      };

      // Use shared sync service which handles Plex write + DB status update
      const syncResult = await syncAlbumToPlex(albumId, metadata, { selectedFields, libraryId: req.library.id, server });
      results.plex = {
        success: syncResult.success,
        message: syncResult.message,
        fieldsUpdated: syncResult.fieldsUpdated,
        error: syncResult.error,
      };
    } catch (error) {
      results.plex = {
        success: false,
        error: error.message,
      };
    }

    const plexSuccess = results.plex && results.plex.success;

    // Build response message
    let message = "";
    let statusCode = 200;
    if (plexSuccess) {
      message = "Metadata synced to Plex successfully";
      statusCode = 200;
    } else {
      message = "Plex update failed";
      statusCode = 500;
    }

    console.log(`\n=== Apply Metadata Result ===`);
    console.log(`Plex success: ${plexSuccess}`);
    console.log(`Message: ${message}`);

    res.status(statusCode).json({
      success: plexSuccess,
      message,
      results,
      albumId,
    });
  } catch (error) {
    console.error("Error applying metadata:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to apply metadata",
    });
  }
});

// Sync Plex metadata to local file tags (ID3/Vorbis)
app.post("/api/albums/:id/sync-to-files", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { selectedFields } = req.body;

    console.log(`\n🔄 Syncing Plex metadata to files for album ${albumId}`);
    console.log(`   Selected fields:`, selectedFields);

    // Validate selectedFields
    if (!selectedFields || typeof selectedFields !== "object") {
      return res.status(400).json({
        success: false,
        error: "selectedFields is required",
      });
    }

    // Get album from Plex with full metadata
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found in Plex",
      });
    }

    // Check if album has a file location
    if (!album.location) {
      return res.status(400).json({
        success: false,
        error: "Album has no file location - cannot sync to files",
      });
    }

    // Write Plex metadata to files
    const result = await writePlexMetadataToFiles(
      album.location,
      album,
      selectedFields
    );

    // If sync was successful, record it in the database
    if (result.success) {
      // Find the album in our database by Plex rating key
      const dbAlbum = await prisma.album.findUnique({
        where: { libraryId_plexRatingKey: { libraryId: req.library.id, plexRatingKey: albumId } },
      });

      if (dbAlbum) {
        // Create or update the PlexFileSync record
        await prisma.plexFileSync.upsert({
          where: { albumId: dbAlbum.id },
          create: {
            albumId: dbAlbum.id,
            syncedFields: JSON.stringify(selectedFields),
            lastSyncedAt: new Date(),
          },
          update: {
            syncedFields: JSON.stringify(selectedFields),
            lastSyncedAt: new Date(),
          },
        });
        console.log(`   ✅ Recorded sync in database for album ${dbAlbum.id}`);
      }
    }

    res.json({
      success: result.success,
      albumId,
      albumTitle: album.title,
      ...result,
    });
  } catch (error) {
    console.error("Error syncing to files:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to sync metadata to files",
    });
  }
});

// Metadata search for a specific album (used by UI)
// This endpoint bridges the existing UI to the new multi-strategy search
app.post("/api/albums/:id/metadata-search", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { services = [REDACTED], query, normalizeQuery = true, page = 1, minScore = 0 } = req.body;

    console.log(`Metadata search for album ${albumId}`);
    console.log(`Services: ${services.join(", ")}, Page: ${page}, MinScore: ${minScore}`);

    // Get album from Plex to extract metadata
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    const results = {};

    // Redacted search using beets-redacted two-step approach
    if (services.includes(REDACTED)) {
      try {
        console.log(`Using two-step search (beets-redacted) for: ${album.artist} - ${album.title}`);

        // For Various Artists albums, extract unique track artists as additional artist variations
        // This mimics how beets provides multiple albumArtist fields (albumartist, albumartists, etc.)
        let trackArtists = [];
        const isVariousArtist =
          album.artist &&
          (album.artist.toLowerCase() === "various" ||
            album.artist.toLowerCase() === "various artists");

        if (isVariousArtist && album.tracks && album.tracks.length > 0) {
          // Extract unique track artists
          const uniqueArtists = new Set();
          album.tracks.forEach(track => {
            if (track.artist && track.artist !== "Various" && track.artist !== "Various Artists") {
              uniqueArtists.add(track.artist);
            }
          });
          trackArtists = Array.from(uniqueArtists);

          console.log(`  Various Artists album detected`);
          console.log(`  Extracted ${trackArtists.length} unique track artists:`, trackArtists);
        }

        const matches = await searchRedactedMultiStrategy(
          {
            albumArtist: album.artist,
            albumArtistCredit: album.artistCredit,
            albumArtistSort: album.artistSort,
            albumArtists: album.artists ? album.artists.split(", ") : null,
            trackArtists: trackArtists, // NEW: Pass track artists for Various Artists albums
            title: album.title,
            titleDisambig: album.titleDisambig,
            year: album.year,
          },
          null, // apiKey (use env default)
          null, // domain (use env default)
          null, // userId (use env default)
          minScore // Use parameter from request (default: 0 = no filtering for manual search)
        );

        // Format for UI: return all matches (already an array)
        results[REDACTED] = {
          results: matches, // matches is already an array
          normalizedQuery: query,
          originalQuery: query,
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          searchStrategy: matches[0]?.searchStrategy || null,
        };

        if (matches.length > 0) {
          console.log(
            `Found ${matches.length} match(es): Best = ${matches[0].artist} - ${matches[0].title} (${matches[0].confidence.toFixed(1)}%)`
          );
        } else {
          console.log(`No matches found meeting minimum threshold`);
        }
      } catch (error) {
        console.error("Redacted search error:", error.message);
        results[REDACTED] = {
          results: [],
          normalizedQuery: null,
          originalQuery: query,
          currentPage: 1,
          totalPages: 0,
          hasMore: false,
        };
      }
    }

    // Discogs search (placeholder)
    if (services.includes("discogs")) {
      results.discogs = {
        results: [],
        message: "Discogs search not yet implemented",
      };
    }

    res.json({
      success: true,
      results,
      albumId,
      searchQuery: query || `${album.artist} ${album.title}`,
    });
  } catch (error) {
    console.error("Error in metadata search:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search metadata",
    });
  }
});

// Simple metadata search (browse-only, no multi-strategy)
// Supports two modes:
// 1. Legacy: { query: "artist album" } - combined search string
// 2. Advanced: { artist: "...", album: "...", year: "..." } - separate field search
app.post("/api/albums/:id/metadata-search/simple", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { services = [REDACTED], query, artist, album, year, page = 1 } = req.body;

    console.log(`Simple metadata search for album ${albumId}`);
    console.log(`Services: ${services.join(", ")}`);

    // Determine search mode: advanced (separate fields) or legacy (combined query)
    const useAdvancedSearch = artist || album || year;

    if (useAdvancedSearch) {
      console.log(`Advanced search mode:`);
      console.log(`  Artist: "${artist || '(any)'}"`);
      console.log(`  Album: "${album || '(any)'}"`);
      console.log(`  Year: "${year || '(any)'}"`);
    } else {
      console.log(`Legacy search mode: Query: "${query}"`);
      if (!query || !query.trim()) {
        return res.status(400).json({
          success: false,
          error: "Either query or artist/album/year fields are required",
        });
      }
    }

    const results = {};

    // Redacted simple browse search (no normalization, no multi-strategy)
    if (services.includes(REDACTED)) {
      try {
        let searchResult;

        if (useAdvancedSearch) {
          // Use advanced search with separate fields
          console.log(`Using advanced browse search`);
          searchResult = await searchRedactedAdvanced(
            { artist, album, year },
            null, // apiKey (use env default)
            null, // domain (use env default)
            page
          );
        } else {
          // Legacy: combined query string
          console.log(`Using simple browse search for: "${query}"`);
          searchResult = await searchRedacted(
            query,
            null, // albumId (unused)
            null, // apiKey (use env default)
            null, // domain (use env default)
            null, // localMetadata (no confidence calculation for simple search)
            false, // normalizeQuery = false (use exact user query)
            page
          );
        }

        results[REDACTED] = searchResult;

        if (searchResult.results && searchResult.results.length > 0) {
          console.log(`Found ${searchResult.results.length} results`);
        } else {
          console.log(`No results found`);
        }
      } catch (error) {
        console.error("Redacted simple search error:", error.message);
        results[REDACTED] = {
          results: [],
          normalizedQuery: null,
          originalQuery: query,
          currentPage: 1,
          totalPages: 0,
          hasMore: false,
        };
      }
    }

    // Discogs search (placeholder)
    if (services.includes("discogs")) {
      results.discogs = {
        results: [],
        message: "Discogs search not yet implemented",
      };
    }

    res.json({
      success: true,
      results,
      albumId,
      searchQuery: query,
    });
  } catch (error) {
    console.error("Error in simple metadata search:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search metadata",
    });
  }
});

// Multi-strategy Redacted search (beets-redacted methodology)
app.post("/api/metadata/redacted/multi-search", async (req, res) => {
  try {
    const {
      albumArtist,
      albumArtistCredit,
      albumArtistSort,
      albumArtists,
      title,
      titleDisambig,
      year,
      apiKey,
      domain,
      userId,
      includeArtistLookup = false,
    } = req.body;

    if (!albumArtist || !title) {
      return res.status(400).json({
        success: false,
        error: "albumArtist and title are required",
      });
    }

    console.log(`Multi-strategy search for: ${albumArtist} - ${title}`);

    const album = {
      albumArtist,
      albumArtistCredit,
      albumArtistSort,
      albumArtists,
      title,
      titleDisambig,
      year,
    };

    const result = await searchRedactedMultiStrategy(
      album,
      apiKey,
      domain,
      userId,
      includeArtistLookup
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error in multi-strategy search:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to perform multi-strategy search",
    });
  }
});

// Albums list endpoint
app.get("/api/albums", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const filter = req.query.filter;
    const fileSyncStatus = req.query.fileSyncStatus; // 'synced' or 'unsynced' for Plex-to-file sync
    const artworkQuality = req.query.artworkQuality; // 'hd' or 'non-hd'
    const syncCompleteness = req.query.syncCompleteness; // 'complete' or 'incomplete'
    const service = req.query.service || "redacted"; // Single service filter (defaults to 'redacted')
    const sort = req.query.sort || "createdAt";
    const sortDirection = req.query.sortDirection || "desc";
    const search = req.query.search;

    // A DB failure resolving the library must not masquerade as a fresh install.
    if (req.libraryLoadError) {
      return res.status(500).json({
        error: `Can't read the music database: ${describeDatabaseError(req.libraryLoadError)}. Once it's back, restart the backend.`,
      });
    }

    // No active library (fresh install / nothing selected): return an empty page
    // so the UI shows its empty state rather than erroring.
    if (!req.library) {
      return res.json({
        albums: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
    }

    // Build where clause based on filter and service
    const where = { libraryId: req.library.id };

    // Search by title or artist (SQLite LIKE is case-insensitive for ASCII)
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { artist: { contains: search.trim() } },
      ];
    }

    // Filter by file sync status (for Sync to Files page)
    if (fileSyncStatus === "synced") {
      where.plexFileSync = { isNot: null };
    } else if (fileSyncStatus === "unsynced") {
      where.plexFileSync = null;
    }

    // Filter by artwork quality (HD = both dimensions >= 1400)
    if (artworkQuality === "hd") {
      where.artworkWidth = { gte: HD_ARTWORK_MIN_SIZE };
      where.artworkHeight = { gte: HD_ARTWORK_MIN_SIZE };
    } else if (artworkQuality === "non-hd") {
      // Non-HD means either dimension < 1400 OR dimensions are null (no artwork/not scanned)
      const nonHdCondition = {
        OR: [
          { artworkWidth: { lt: HD_ARTWORK_MIN_SIZE } },
          { artworkHeight: { lt: HD_ARTWORK_MIN_SIZE } },
          { artworkWidth: null },
        ]
      };
      // If search OR already exists, combine with AND
      if (where.OR) {
        const searchOR = where.OR;
        delete where.OR;
        where.AND = [{ OR: searchOR }, nonHdCondition];
      } else {
        where.OR = nonHdCondition.OR;
      }
    }

    if (filter === "matched") {
      // Show albums matched to the selected service
      where.matchStatus = "MATCHED";
      where.metadataMatches = {
        some: {
          metadataService: {
            name: service,
          },
        },
      };
    } else if (filter === "unmatched") {
      // Only albums without metadata service matches
      where.matchStatus = "UNMATCHED";
    } else if (filter === "synced") {
      // Show synced albums (optionally filtered by service)
      where.matchStatus = "SYNCED";
      if (service) {
        where.metadataMatches = {
          some: {
            metadataService: {
              name: service,
            },
          },
        };
      }
    } else if (filter === "matchedOrSynced") {
      // Show both matched and synced albums (for navigation across all with matches)
      where.matchStatus = { in: ["MATCHED", "SYNCED"] };
      where.metadataMatches = {
        some: {
          metadataService: {
            name: service || "redacted",
          },
        },
      };
    }

    // Get total count
    const total = await prisma.album.count({ where });

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Build orderBy clause - map frontend field names to database columns
    const sortFieldMap = {
      createdAt: "createdAt",
      year: "year",
      addedAt: "addedAt",
      titleSort: "titleSort",
      title: "title",
      artist: "artist",
      genre: "genre",
      folderCreatedAt: "folderCreatedAt",
    };

    const orderByField = sortFieldMap[sort] || "createdAt";
    const orderBy = {
      [orderByField]: sortDirection.toLowerCase() === "asc" ? "asc" : "desc",
    };

    // Fetch albums with metadata matches and file sync status
    const albums = await prisma.album.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        metadataMatches: {
          include: {
            metadataService: true,
          },
        },
        plexFileSync: true,
      },
    });

    // Fetch artwork URLs for all albums in parallel
    const server = await activeServer(req);
    const artworkUrlsPromises = albums.map(album => getPlexAlbumArtworkUrls(server, album.plexRatingKey));
    const artworkUrlsArray = await Promise.all(artworkUrlsPromises);

    // Helper to check if all implemented fields are synced
    const checkSyncCompleteness = (plexFileSync) => {
      if (!plexFileSync) return null;
      try {
        const syncedFields = JSON.parse(plexFileSync.syncedFields || "{}");
        const allImplementedSynced = IMPLEMENTED_PLEX_TO_FILE_FIELDS.every(
          field => syncedFields[field] === true
        );
        return allImplementedSynced ? "complete" : "incomplete";
      } catch {
        return "incomplete";
      }
    };

    // Transform to match frontend expectations
    let transformedAlbums = albums.map((album, index) => {
      const { thumbUrl, fullUrl, genres, styles } = artworkUrlsArray[index];

      // Extract Redacted external ID if matched
      const redactedMatch = album.metadataMatches?.find(
        match => match.metadataService.name === "redacted"
      );

      // Check if album has MusicBrainz match
      const hasMusicBrainzMatch = album.metadataMatches?.some(
        match => match.metadataService.name === "musicbrainz"
      );

      // Calculate HD artwork status
      const albumIsHd = isHdArtwork(album.artworkWidth, album.artworkHeight);

      // Calculate sync completeness
      const albumSyncCompleteness = checkSyncCompleteness(album.plexFileSync);

      return {
        id: album.plexRatingKey,
        title: album.title,
        artist: album.artist,
        hasArtwork: !!fullUrl,
        artworkThumbUrl: thumbUrl,
        artworkFullUrl: fullUrl,
        redactedId: redactedMatch?.externalId,
        matchStatus: album.matchStatus,
        hasMusicBrainzMatch,
        genres,
        styles,
        // Plex-to-file sync status
        fileSyncStatus: album.plexFileSync ? 'synced' : 'unsynced',
        fileSyncedAt: album.plexFileSync?.lastSyncedAt || null,
        // Artwork quality
        artworkWidth: album.artworkWidth,
        artworkHeight: album.artworkHeight,
        isHdArtwork: albumIsHd,
        // Sync completeness
        syncCompleteness: albumSyncCompleteness,
      };
    });

    // Apply in-memory sync completeness filter (can't filter JSON in SQLite efficiently)
    if (syncCompleteness === "complete") {
      transformedAlbums = transformedAlbums.filter(a => a.syncCompleteness === "complete");
    } else if (syncCompleteness === "incomplete") {
      transformedAlbums = transformedAlbums.filter(a => a.syncCompleteness === "incomplete");
    }

    // Note: When syncCompleteness filter is applied, the pagination counts may be slightly off
    // since we filtered in memory. For now this is acceptable; optimization would require
    // adding a computed column to the database.

    res.json({
      albums: transformedAlbums,
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get metadata services
app.get("/api/metadata-services", async (req, res) => {
  try {
    const services = await prisma.metadataService.findMany({
      orderBy: {
        name: "asc",
      },
    });

    res.json({
      success: true,
      services,
    });
  } catch (error) {
    console.error("Error fetching metadata services:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get metadata matches for a specific album
app.get("/api/albums/:id/metadata-matches", async (req, res) => {
  try {
    // The :id here is the hash-based album ID, not plex rating key
    const albumId = req.params.id;

    const matches = await prisma.albumMetadataServiceMatch.findMany({
      where: {
        albumId,
      },
      include: {
        metadataService: true,
      },
    });

    const transformedMatches = matches.map(match => ({
      service: match.metadataService.name,
      externalId: match.externalId,
    }));

    res.json({
      success: true,
      matches: transformedMatches,
    });
  } catch (error) {
    console.error("Error fetching metadata matches:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Album artwork thumbnail endpoint (300x300)
app.get("/api/albums/:id/artwork/thumb", async (req, res) => {
  try {
    const server = await activeServer(req);
    const { thumbUrl } = await getPlexAlbumArtworkUrls(server, req.params.id);

    if (!thumbUrl) {
      return res.status(404).json({
        success: false,
        error: "No artwork available",
      });
    }

    // Redirect to the Plex thumbnail URL
    res.redirect(thumbUrl);
  } catch (error) {
    console.error("Error fetching artwork thumbnail:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Album artwork endpoint (full resolution)
app.get("/api/albums/:id/artwork", async (req, res) => {
  try {
    const server = await activeServer(req);
    const { fullUrl } = await getPlexAlbumArtworkUrls(server, req.params.id);

    if (!fullUrl) {
      return res.status(404).json({
        success: false,
        error: "No artwork available",
      });
    }

    // Redirect to the Plex full resolution artwork URL
    res.redirect(fullUrl);
  } catch (error) {
    console.error("Error fetching artwork:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Serve embedded artwork from local audio files
app.get("/api/albums/:id/artwork/embedded", async (req, res) => {
  try {
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, req.params.id);
    if (!album) return res.status(404).json({ success: false, error: "Album not found" });
    if (!album.location) return res.status(404).json({ success: false, error: "Album location not available" });

    const artwork = await getEmbeddedArtwork(album.location);
    if (!artwork) return res.status(404).json({ success: false, error: "No embedded artwork found" });

    res.set("Content-Type", artwork.format);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(artwork.data);
  } catch (error) {
    console.error("Error serving embedded artwork:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get embedded artwork dimensions/info without serving full image
app.get("/api/albums/:id/artwork/embedded/info", async (req, res) => {
  try {
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, req.params.id);
    if (!album) return res.status(404).json({ success: false, error: "Album not found" });
    if (!album.location) return res.status(404).json({ success: false, error: "Album location not available" });

    const artwork = await getEmbeddedArtwork(album.location);
    if (!artwork) return res.status(404).json({ success: false, error: "No embedded artwork found" });

    const dimensions = getImageDimensionsFromBuffer(artwork.data);
    res.json({
      success: true,
      width: dimensions?.width || null,
      height: dimensions?.height || null,
      format: artwork.format,
    });
  } catch (error) {
    console.error("Error getting embedded artwork info:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Embed artwork to album files
app.post("/api/albums/:id/artwork/embed", async (req, res) => {
  try {
    const albumId = req.params.id;
    const { artworkUrl } = req.body;

    console.log(`\n=== Embed Artwork Request ===`);
    console.log(`Album ID: ${albumId}`);
    console.log(`Artwork URL: ${artworkUrl}`);

    if (!artworkUrl) {
      return res.status(400).json({
        success: false,
        error: "artworkUrl is required",
      });
    }

    // Get album from Plex to get file locations
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    if (!album.tracks || album.tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Album has no tracks",
      });
    }

    console.log(`Downloading artwork from: ${artworkUrl}`);

    // Download artwork
    const image = await fetchImage(artworkUrl);

    console.log(`Downloaded ${image.size} bytes (${image.mime})`);
    console.log(`Embedding artwork to ${album.tracks.length} tracks...`);

    // Embed artwork to all tracks
    const embedResult = await embedArtworkToAlbum(album.tracks, image);

    console.log(
      `Embedding complete: ${embedResult.summary.embedded}/${embedResult.summary.total} successful`
    );

    // Update artwork dimensions in database
    if (embedResult.summary.embedded > 0) {
      try {
        const dimensions = getImageDimensionsFromBuffer(image.data);
        if (dimensions) {
          const dbAlbum = await prisma.album.findUnique({
            where: { libraryId_plexRatingKey: { libraryId: req.library.id, plexRatingKey: albumId } },
          });
          if (dbAlbum) {
            await prisma.album.update({
              where: { id: dbAlbum.id },
              data: {
                artworkWidth: dimensions.width,
                artworkHeight: dimensions.height,
              },
            });
            console.log(`Updated artwork dimensions: ${dimensions.width}x${dimensions.height}`);
          }
        }
      } catch (dimError) {
        console.warn("Could not update artwork dimensions:", dimError.message);
      }
    }

    res.json({
      success: true,
      data: {
        summary: embedResult.summary,
        results: embedResult.results,
      },
    });
  } catch (error) {
    console.error("Error embedding artwork:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Upload and embed custom artwork
app.post("/api/albums/:id/artwork/upload", upload.single("artwork"), async (req, res) => {
  try {
    const albumId = req.params.id;
    const file = req.file;

    console.log(`\n=== Upload Artwork Request ===`);
    console.log(`Album ID: ${albumId}`);
    console.log(`File: ${file ? file.originalname : "none"}`);

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    // Get album from Plex to get file locations
    const server = await activeServer(req);
    const album = await getPlexAlbum(server, albumId);

    if (!album) {
      return res.status(404).json({
        success: false,
        error: "Album not found",
      });
    }

    if (!album.tracks || album.tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Album has no tracks",
      });
    }

    console.log(`Received ${file.size} bytes (${file.mimetype})`);
    console.log(`Embedding artwork to ${album.tracks.length} tracks...`);

    // Create image object in the format expected by embedArtworkToAlbum
    const image = {
      data: file.buffer,
      mime: file.mimetype,
      size: file.size,
    };

    // Embed artwork to all tracks
    const embedResult = await embedArtworkToAlbum(album.tracks, image);

    console.log(
      `Embedding complete: ${embedResult.summary.embedded}/${embedResult.summary.total} successful`
    );

    // Update artwork dimensions in database
    if (embedResult.summary.embedded > 0) {
      try {
        const dimensions = getImageDimensionsFromBuffer(file.buffer);
        if (dimensions) {
          const dbAlbum = await prisma.album.findUnique({
            where: { libraryId_plexRatingKey: { libraryId: req.library.id, plexRatingKey: albumId } },
          });
          if (dbAlbum) {
            await prisma.album.update({
              where: { id: dbAlbum.id },
              data: {
                artworkWidth: dimensions.width,
                artworkHeight: dimensions.height,
              },
            });
            console.log(`Updated artwork dimensions: ${dimensions.width}x${dimensions.height}`);
          }
        }
      } catch (dimError) {
        console.warn("Could not update artwork dimensions:", dimError.message);
      }
    }

    res.json({
      success: true,
      data: {
        summary: embedResult.summary,
        results: embedResult.results,
      },
    });
  } catch (error) {
    console.error("Error uploading and embedding artwork:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// SYNC FAILURES ENDPOINTS
// ============================================================

// Get recent sync failures
app.get("/api/sync-failures", async (req, res) => {
  try {
    const operation = req.query.operation || null;
    const limit = parseInt(req.query.limit) || 50;
    const search = (req.query.q || "").trim() || null;

    if (!req.library) return res.json({ success: true, failures: [] });
    const failures = await getRecentFailures(operation, limit, req.library.id, search);

    res.json({
      success: true,
      failures,
    });
  } catch (error) {
    console.error("Error fetching sync failures:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get failure counts by operation type
app.get("/api/sync-failures/counts", async (req, res) => {
  try {
    if (!req.library) return res.json({ success: true, counts: {} });
    const counts = await getFailureCounts(req.library.id);

    res.json({
      success: true,
      counts,
    });
  } catch (error) {
    console.error("Error fetching failure counts:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear sync failures
app.delete("/api/sync-failures", async (req, res) => {
  try {
    const operation = req.query.operation || null;

    if (!req.library) return res.json({ success: true, deleted: 0, message: "No active library" });
    const result = await clearFailures(operation, req.library.id);

    res.json({
      success: true,
      deleted: result.count,
      message: operation
        ? `Cleared ${result.count} ${operation} failures`
        : `Cleared ${result.count} failures`,
    });
  } catch (error) {
    console.error("Error clearing sync failures:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ─── Plex Settings Endpoints ──────────────────────────────────────────────────

// Build the server -> library tree for the settings UI (no secrets).
async function getPlexConfigTree() {
  const account = await prisma.plexAccount.findFirst({
    include: {
      servers: {
        orderBy: { name: "asc" },
        include: { libraries: { orderBy: { title: "asc" } } },
      },
    },
  });
  const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return {
    configured: !!account,
    username: account?.username || null,
    activeLibraryId: appSettings?.activeLibraryId || null,
    servers: (account?.servers || []).map(s => ({
      id: s.id,
      name: s.name,
      machineIdentifier: s.machineIdentifier,
      isEnabled: s.isEnabled,
      libraries: s.libraries.map(l => ({
        id: l.id,
        title: l.title,
        sectionKey: l.sectionKey,
        isEnabled: l.isEnabled,
      })),
    })),
  };
}

const EMPTY_BULK_SYNC_STATE = {
  isSyncing: false, current: 0, total: 0, synced: 0, failed: 0,
  currentAlbum: null, shouldStop: false, error: null, selectedFields: {},
};
const EMPTY_BULK_SYNC_TO_FILES_STATE = {
  ...EMPTY_BULK_SYNC_STATE, repaired: 0, corrupted: 0, corruptedFiles: [], halted: false,
};

// GET /api/settings/plex - current config (no secrets)
app.get("/api/settings/plex", async (req, res) => {
  try {
    res.json(await getPlexConfigTree());
  } catch (err) {
    console.error("Error fetching plex settings:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/plex - disconnect and wipe all Plex-derived data
app.delete("/api/settings/plex", async (req, res) => {
  try {
    stopScan();
    bulkSyncState = { ...EMPTY_BULK_SYNC_STATE };
    bulkSyncToFilesState = { ...EMPTY_BULK_SYNC_TO_FILES_STATE };

    // Deleting the account cascades servers -> libraries -> albums (+ matches/syncs).
    await prisma.plexAccount.deleteMany({});
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { activeLibraryId: null },
      create: { id: "singleton" },
    });

    invalidateLibraryCache();
    clearPlexCache();
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting Plex data:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/plex/oauth/start - initiate PIN-based OAuth
app.post("/api/settings/plex/oauth/start", async (req, res) => {
  try {
    const { MyPlexAccount } = await import("@ctrl/plex");
    const webLogin = await MyPlexAccount.getWebLogin();

    // Store session
    pendingPlexOAuthSessions.set(String(webLogin.id), {
      webLogin,
      status: "pending",
      account: null,
      error: null,
    });

    // Background: poll plex.tv until approved or timeout (300s)
    MyPlexAccount.webLoginCheck(webLogin, 300)
      .then(account => {
        const session = pendingPlexOAuthSessions.get(String(webLogin.id));
        if (session) {
          session.status = "approved";
          session.account = account;
        }
      })
      .catch(err => {
        const session = pendingPlexOAuthSessions.get(String(webLogin.id));
        if (session) {
          session.status = "failed";
          session.error = err.message || "OAuth failed";
        }
      });

    res.json({ id: webLogin.id, code: webLogin.code, uri: webLogin.uri });
  } catch (err) {
    console.error("Plex OAuth start error:", err);
    res.status(500).json({ error: err.message || "Failed to start Plex OAuth" });
  }
});

// GET /api/settings/plex/oauth/poll?id=... - check OAuth status; on approval persist
// the account and discover its servers + music libraries (all disabled until the
// user selects them in the wizard). Returns the full config tree.
app.get("/api/settings/plex/oauth/poll", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id is required" });

    const session = pendingPlexOAuthSessions.get(String(id));
    if (!session) return res.status(404).json({ error: "OAuth session not found" });

    if (session.status === "pending") return res.json({ status: "pending" });
    if (session.status === "failed") {
      pendingPlexOAuthSessions.delete(String(id));
      return res.json({ status: "failed", error: session.error });
    }

    const account = session.account;
    const authToken = account.authenticationToken;
    const username = account.username || account.email || account.title || null;

    // Replace any existing account (cascades to old servers/libraries/albums).
    await prisma.plexAccount.deleteMany({});
    const dbAccount = await prisma.plexAccount.create({ data: { authToken, username } });

    // Discover + persist servers, then their music libraries (best-effort).
    const servers = await discoverServers(authToken);
    for (const s of servers) {
      const dbServer = await prisma.plexServer.create({
        data: {
          accountId: dbAccount.id,
          machineIdentifier: s.machineIdentifier,
          name: s.name,
          accessToken: s.accessToken,
          isEnabled: false,
        },
      });
      try {
        const libs = await discoverLibraries({ ...dbServer, account: dbAccount });
        for (const l of libs) {
          await prisma.plexLibrary.create({
            data: { serverId: dbServer.id, sectionKey: l.sectionKey, title: l.title, type: l.type, isEnabled: false },
          });
        }
      } catch (e) {
        console.warn(`Could not list libraries for server "${s.name}": ${e.message}`);
      }
    }

    clearPlexCache();
    pendingPlexOAuthSessions.delete(String(id));
    res.json({ status: "approved", ...(await getPlexConfigTree()) });
  } catch (err) {
    console.error("Plex OAuth poll error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/plex/selection - enable a set of libraries (and their servers)
app.put("/api/settings/plex/selection", async (req, res) => {
  try {
    const { libraryIds } = req.body;
    if (!Array.isArray(libraryIds)) {
      return res.status(400).json({ error: "libraryIds (array) is required" });
    }
    const enabled = new Set(libraryIds);
    const noneSentinel = ["__none__"];

    const allLibraries = await prisma.plexLibrary.findMany({ select: { id: true, serverId: true } });
    const enabledServerIds = [...new Set(allLibraries.filter(l => enabled.has(l.id)).map(l => l.serverId))];

    await prisma.$transaction([
      prisma.plexLibrary.updateMany({ where: { id: { in: libraryIds.length ? libraryIds : noneSentinel } }, data: { isEnabled: true } }),
      prisma.plexLibrary.updateMany({ where: { id: { notIn: libraryIds.length ? libraryIds : noneSentinel } }, data: { isEnabled: false } }),
      prisma.plexServer.updateMany({ where: { id: { in: enabledServerIds.length ? enabledServerIds : noneSentinel } }, data: { isEnabled: true } }),
      prisma.plexServer.updateMany({ where: { id: { notIn: enabledServerIds.length ? enabledServerIds : noneSentinel } }, data: { isEnabled: false } }),
    ]);

    // Keep activeLibraryId pointing at an enabled library.
    const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    let activeLibraryId = appSettings?.activeLibraryId || null;
    if (!activeLibraryId || !enabled.has(activeLibraryId)) {
      activeLibraryId = libraryIds[0] || null;
    }
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { activeLibraryId },
      create: { id: "singleton", activeLibraryId },
    });

    invalidateLibraryCache();
    clearPlexCache();
    res.json({ success: true, ...(await getPlexConfigTree()) });
  } catch (err) {
    console.error("Error saving Plex selection:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/servers - enabled servers + libraries (+ album counts) for the header switcher
app.get("/api/servers", async (req, res) => {
  try {
    const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    const activeLibraryId = appSettings?.activeLibraryId || null;

    const servers = await prisma.plexServer.findMany({
      where: { isEnabled: true },
      orderBy: { name: "asc" },
      include: { libraries: { where: { isEnabled: true }, orderBy: { title: "asc" } } },
    });
    const counts = await prisma.album.groupBy({ by: ["libraryId"], _count: { libraryId: true } });
    const countMap = Object.fromEntries(counts.map(c => [c.libraryId, c._count.libraryId]));

    res.json({
      activeLibraryId,
      servers: servers.map(s => ({
        id: s.id,
        name: s.name,
        libraries: s.libraries.map(l => ({
          id: l.id,
          title: l.title,
          albumCount: countMap[l.id] || 0,
          isActive: l.id === activeLibraryId,
        })),
      })),
    });
  } catch (err) {
    console.error("Error fetching servers:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/active-library - switch the active library (header switcher)
app.put("/api/settings/active-library", async (req, res) => {
  try {
    const { libraryId } = req.body;
    if (!libraryId) return res.status(400).json({ error: "libraryId is required" });

    const library = await prisma.plexLibrary.findUnique({ where: { id: libraryId } });
    if (!library || !library.isEnabled) {
      return res.status(400).json({ error: "Library not found or not enabled" });
    }

    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { activeLibraryId: libraryId },
      create: { id: "singleton", activeLibraryId: libraryId },
    });

    invalidateLibraryCache();
    console.log(`🔄 Active library switched to "${library.title}" (${libraryId})`);
    res.json({ success: true, activeLibraryId: libraryId });
  } catch (err) {
    console.error("Error setting active library:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Restore Plex dates from folder birthtimes (bulk, direct DB) ─────────────

function getPlexDbPath() {
  return path.join(
    os.homedir(),
    "Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
  );
}

// Preview: dry-run comparison of Plex added_at vs folder birthtimes
app.get("/api/plex/restore-dates/preview", async (req, res) => {
  try {
    const plexDb = getPlexDbPath();
    const libraryRoot = process.env.MUSIC_LIBRARY_PATH;

    if (!existsSync(plexDb)) {
      return res.status(400).json({ success: false, error: "Plex database not found" });
    }
    if (!libraryRoot || !existsSync(libraryRoot)) {
      return res.status(400).json({ success: false, error: "Music library path not found. Is the drive mounted?" });
    }

    // Query albums from Plex DB
    const sep = "\x1f";
    const sql = `SELECT
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
     GROUP BY mi.id`;

    const tmpFile = path.join(os.tmpdir(), `plex-restore-${Date.now()}.sql`);
    writeFileSync(tmpFile, `.separator '${sep}'\n${sql}\n`);
    let rows;
    try {
      const raw = execSync(
        `/usr/bin/sqlite3 ${JSON.stringify(plexDb)} < ${JSON.stringify(tmpFile)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, shell: true }
      );
      rows = raw.trim().split("\n").filter(Boolean).map((line) => line.split(sep));
    } finally {
      unlinkSync(tmpFile);
    }

    const formatDate = (unixSeconds) =>
      new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);

    let toUpdate = 0;
    let alreadyCorrect = 0;
    let missing = 0;
    const changes = [];

    for (const [idStr, title, addedAtStr, dirPath] of rows) {
      const currentAddedAt = parseInt(addedAtStr, 10);
      const topLevel = dirPath.split("/")[0];
      const folderPath = path.join(libraryRoot, topLevel);

      try {
        const s = statSync(folderPath);
        const birthtime = Math.floor(s.birthtimeMs / 1000);

        if (birthtime === currentAddedAt) {
          alreadyCorrect++;
        } else {
          toUpdate++;
          changes.push({
            id: parseInt(idStr, 10),
            title,
            oldDate: formatDate(currentAddedAt),
            newDate: formatDate(birthtime),
          });
        }
      } catch (err) {
        missing++;
      }
    }

    res.json({
      success: true,
      summary: {
        total: rows.length,
        toUpdate,
        alreadyCorrect,
        missing,
      },
      changes: changes.slice(0, 20),
      totalChanges: changes.length,
    });
  } catch (error) {
    console.error("Error previewing restore dates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply: update Plex DB added_at from folder birthtimes
app.post("/api/plex/restore-dates/apply", async (req, res) => {
  try {
    const plexDb = getPlexDbPath();
    const libraryRoot = process.env.MUSIC_LIBRARY_PATH;

    if (!existsSync(plexDb)) {
      return res.status(400).json({ success: false, error: "Plex database not found" });
    }
    if (!libraryRoot || !existsSync(libraryRoot)) {
      return res.status(400).json({ success: false, error: "Music library path not found. Is the drive mounted?" });
    }

    // Backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${plexDb}.backup-${timestamp}`;
    copyFileSync(plexDb, backupPath);
    console.log(`Backed up Plex DB to: ${backupPath}`);

    // Query albums
    const sep = "\x1f";
    const sql = `SELECT
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
     GROUP BY mi.id`;

    const tmpFile = path.join(os.tmpdir(), `plex-restore-apply-${Date.now()}.sql`);
    writeFileSync(tmpFile, `.separator '${sep}'\n${sql}\n`);
    let rows;
    try {
      const raw = execSync(
        `/usr/bin/sqlite3 ${JSON.stringify(plexDb)} < ${JSON.stringify(tmpFile)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, shell: true }
      );
      rows = raw.trim().split("\n").filter(Boolean).map((line) => line.split(sep));
    } finally {
      unlinkSync(tmpFile);
    }

    // Collect updates
    const updates = [];
    for (const [idStr, title, addedAtStr, dirPath] of rows) {
      const albumId = parseInt(idStr, 10);
      const currentAddedAt = parseInt(addedAtStr, 10);
      const topLevel = dirPath.split("/")[0];
      const folderPath = path.join(libraryRoot, topLevel);

      try {
        const s = statSync(folderPath);
        const birthtime = Math.floor(s.birthtimeMs / 1000);
        if (birthtime !== currentAddedAt) {
          updates.push([albumId, birthtime]);
        }
      } catch {
        // skip missing folders
      }
    }

    if (updates.length === 0) {
      return res.json({ success: true, updated: 0, message: "No changes needed" });
    }

    // Build SQL: drop FTS triggers, update in transaction, recreate triggers
    const dropTriggers = [
      "DROP TRIGGER IF EXISTS fts4_metadata_titles_before_update_icu;",
      "DROP TRIGGER IF EXISTS fts4_metadata_titles_after_update_icu;",
      "DROP TRIGGER IF EXISTS fts4_metadata_titles_before_delete_icu;",
      "DROP TRIGGER IF EXISTS fts4_metadata_titles_after_insert_icu;",
    ].join("\n");

    const recreateTriggers = [
      "CREATE TRIGGER fts4_metadata_titles_before_update_icu BEFORE UPDATE ON metadata_items BEGIN DELETE FROM fts4_metadata_titles_icu WHERE docid=old.rowid; END;",
      "CREATE TRIGGER fts4_metadata_titles_after_update_icu AFTER UPDATE ON metadata_items BEGIN INSERT INTO fts4_metadata_titles_icu(docid, title, title_sort, original_title) VALUES(new.rowid, new.title, new.title_sort, new.original_title); END;",
      "CREATE TRIGGER fts4_metadata_titles_before_delete_icu BEFORE DELETE ON metadata_items BEGIN DELETE FROM fts4_metadata_titles_icu WHERE docid=old.rowid; END;",
      "CREATE TRIGGER fts4_metadata_titles_after_insert_icu AFTER INSERT ON metadata_items BEGIN INSERT INTO fts4_metadata_titles_icu(docid, title, title_sort, original_title) VALUES(new.rowid, new.title, new.title_sort, new.original_title); END;",
    ].join("\n");

    const statements = updates.map(
      ([albumId, newTs]) => `UPDATE metadata_items SET added_at = ${newTs} WHERE id = ${albumId};`
    );

    const fullSql = [dropTriggers, "BEGIN TRANSACTION;", ...statements, "COMMIT;", recreateTriggers].join("\n");

    const execTmpFile = path.join(os.tmpdir(), `plex-restore-exec-${Date.now()}.sql`);
    writeFileSync(execTmpFile, fullSql);
    try {
      execSync(`/usr/bin/sqlite3 ${JSON.stringify(plexDb)} < ${JSON.stringify(execTmpFile)}`, {
        encoding: "utf-8",
        shell: true,
      });
    } finally {
      unlinkSync(execTmpFile);
    }

    console.log(`Applied ${updates.length} date restorations to Plex DB`);
    res.json({
      success: true,
      updated: updates.length,
      backupPath,
      message: `Successfully updated ${updates.length} albums. FTS triggers restored.`,
    });
  } catch (error) {
    console.error("Error applying restore dates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// Favourites Wizard - swipe game + batched album-folder copy
// ============================================================

// Copy operation state (same pattern as bulkScanState)
let favouritesCopyState = {
  isCopying: false,
  current: 0,
  total: 0,
  copied: 0,
  skippedExists: 0,
  failed: 0,
  currentAlbum: null,
  shouldStop: false,
  error: null,
  scanTriggered: false,
  results: [],
  sourceLibraryId: null,
  destinationLibraryId: null,
};

/**
 * Resolve and validate the source/destination pair every wizard route needs.
 * Sends a 400 and returns null on any problem. Ids come from query or body.
 */
async function resolveWizardLibraries(req, res) {
  const sourceLibraryId = req.query.sourceLibraryId || req.body?.sourceLibraryId;
  const destinationLibraryId = req.query.destinationLibraryId || req.body?.destinationLibraryId;

  if (!sourceLibraryId || !destinationLibraryId) {
    res.status(400).json({ error: "sourceLibraryId and destinationLibraryId are required" });
    return null;
  }
  if (sourceLibraryId === destinationLibraryId) {
    res.status(400).json({ error: "Source and destination must be different libraries" });
    return null;
  }
  const [sourceLibrary, destLibrary] = await Promise.all([
    loadLibrary(sourceLibraryId),
    loadLibrary(destinationLibraryId),
  ]);
  if (!sourceLibrary || !destLibrary) {
    res.status(400).json({ error: "Source or destination library not found" });
    return null;
  }
  return { sourceLibrary, destLibrary };
}

// Next batch of unjudged albums from the source (judging advances the feed)
app.get("/api/favourites-wizard/candidates", async (req, res) => {
  try {
    const libs = await resolveWizardLibraries(req, res);
    if (!libs) return;
    const { sourceLibrary, destLibrary } = libs;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const sourceServer = await getServerConnection(sourceLibrary.server);
    const sourceSection = await getLibrarySection(sourceLibrary);
    const [{ albums, pagination }, swipes, destKeys] = await Promise.all([
      getPlexAlbums(sourceServer, sourceSection, {
        limit: 100000,
        sort: "titleSort",
        sortDirection: "asc",
      }),
      prisma.favouriteSwipe.findMany({
        where: { sourceLibraryId: sourceLibrary.id, destinationLibraryId: destLibrary.id },
        select: { ratingKey: true, decision: true },
      }),
      getDestinationAlbumKeySet(destLibrary),
    ]);

    const judgedKeys = new Set(swipes.map(s => s.ratingKey));
    const kept = swipes.filter(s => s.decision === "KEEP").length;

    let hiddenInDestination = 0;
    const unjudged = albums.filter(album => {
      if (judgedKeys.has(String(album.id))) return false;
      if (destKeys.has(normalizeKey(album.artist, album.title))) {
        hiddenInDestination++;
        return false;
      }
      return true;
    });

    res.json({
      candidates: unjudged.slice(0, limit).map(a => ({
        ratingKey: String(a.id),
        title: a.title,
        artist: a.artist,
        year: a.year,
        genre: a.genre,
        artworkUrl: a.artworkUrl,
        location: a.location,
      })),
      remaining: unjudged.length,
      totals: {
        sourceTotal: pagination.total,
        judged: judgedKeys.size,
        kept,
        skipped: judgedKeys.size - kept,
        hiddenInDestination,
      },
    });
  } catch (error) {
    console.error("Error fetching favourites candidates:", error);
    res.status(500).json({ error: error.message });
  }
});

// Record a swipe (KEEP or SKIP)
app.post("/api/favourites-wizard/decisions", async (req, res) => {
  try {
    const libs = await resolveWizardLibraries(req, res);
    if (!libs) return;
    const { sourceLibrary, destLibrary } = libs;
    const { ratingKey, decision, title, artist, location } = req.body || {};

    if (!ratingKey || !["KEEP", "SKIP"].includes(decision)) {
      return res.status(400).json({ error: "ratingKey and a KEEP/SKIP decision are required" });
    }

    const pairKey = {
      sourceLibraryId: sourceLibrary.id,
      destinationLibraryId: destLibrary.id,
      ratingKey: String(ratingKey),
    };
    await prisma.favouriteSwipe.upsert({
      where: { sourceLibraryId_destinationLibraryId_ratingKey: pairKey },
      create: {
        ...pairKey,
        title: title || "",
        artist: artist || "",
        location: location || null,
        decision,
        copyStatus: decision === "KEEP" ? "PENDING" : null,
      },
      update: {
        title: title || "",
        artist: artist || "",
        location: location || null,
        decision,
        copyStatus: decision === "KEEP" ? "PENDING" : null,
        copyError: null,
      },
    });

    const shortlistCount = await prisma.favouriteSwipe.count({
      where: {
        sourceLibraryId: sourceLibrary.id,
        destinationLibraryId: destLibrary.id,
        decision: "KEEP",
      },
    });
    res.json({ ok: true, shortlistCount });
  } catch (error) {
    console.error("Error recording favourites decision:", error);
    res.status(500).json({ error: error.message });
  }
});

// Undo a swipe (album re-enters the feed)
app.delete("/api/favourites-wizard/decisions", async (req, res) => {
  try {
    const libs = await resolveWizardLibraries(req, res);
    if (!libs) return;
    const { sourceLibrary, destLibrary } = libs;
    const { ratingKey } = req.query;
    if (!ratingKey) return res.status(400).json({ error: "ratingKey is required" });

    await prisma.favouriteSwipe.deleteMany({
      where: {
        sourceLibraryId: sourceLibrary.id,
        destinationLibraryId: destLibrary.id,
        ratingKey: String(ratingKey),
      },
    });
    const shortlistCount = await prisma.favouriteSwipe.count({
      where: {
        sourceLibraryId: sourceLibrary.id,
        destinationLibraryId: destLibrary.id,
        decision: "KEEP",
      },
    });
    res.json({ ok: true, shortlistCount });
  } catch (error) {
    console.error("Error undoing favourites decision:", error);
    res.status(500).json({ error: error.message });
  }
});

// Shortlist + per-status counts (resume info and summary fallback)
app.get("/api/favourites-wizard/shortlist", async (req, res) => {
  try {
    const libs = await resolveWizardLibraries(req, res);
    if (!libs) return;
    const { sourceLibrary, destLibrary } = libs;

    const pairWhere = {
      sourceLibraryId: sourceLibrary.id,
      destinationLibraryId: destLibrary.id,
    };
    const [shortlist, judged] = await Promise.all([
      prisma.favouriteSwipe.findMany({
        where: { ...pairWhere, decision: "KEEP" },
        orderBy: { updatedAt: "asc" },
      }),
      prisma.favouriteSwipe.count({ where: pairWhere }),
    ]);

    const counts = { pending: 0, copied: 0, skippedExists: 0, failed: 0 };
    for (const row of shortlist) {
      if (row.copyStatus === "PENDING") counts.pending++;
      else if (row.copyStatus === "COPIED") counts.copied++;
      else if (row.copyStatus === "SKIPPED_EXISTS") counts.skippedExists++;
      else if (row.copyStatus === "FAILED") counts.failed++;
    }
    res.json({ shortlist, counts, judged });
  } catch (error) {
    console.error("Error fetching favourites shortlist:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start the batched folder copy (fire-and-forget; poll progress)
app.post("/api/favourites-wizard/copy", async (req, res) => {
  try {
    if (favouritesCopyState.isCopying) {
      return res.status(409).json({ error: "A favourites copy is already in progress" });
    }
    const libs = await resolveWizardLibraries(req, res);
    if (!libs) return;
    const { sourceLibrary, destLibrary } = libs;

    // FAILED rows are included so re-running the copy retries them
    const rows = await prisma.favouriteSwipe.findMany({
      where: {
        sourceLibraryId: sourceLibrary.id,
        destinationLibraryId: destLibrary.id,
        decision: "KEEP",
        copyStatus: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { updatedAt: "asc" },
    });

    favouritesCopyState = {
      isCopying: true,
      current: 0,
      total: rows.length,
      copied: 0,
      skippedExists: 0,
      failed: 0,
      currentAlbum: null,
      shouldStop: false,
      error: null,
      scanTriggered: false,
      results: [],
      sourceLibraryId: sourceLibrary.id,
      destinationLibraryId: destLibrary.id,
    };

    res.json({ started: true, total: rows.length });

    runFavouritesCopy(favouritesCopyState, sourceLibrary, destLibrary, rows)
      .catch(err => {
        console.error("Favourites copy failed:", err);
        favouritesCopyState.error = err.message;
      })
      .finally(() => {
        favouritesCopyState.isCopying = false;
        favouritesCopyState.currentAlbum = null;
      });
  } catch (error) {
    console.error("Error starting favourites copy:", error);
    res.status(500).json({ error: error.message });
  }
});

// Copy progress
app.get("/api/favourites-wizard/copy/progress", (req, res) => {
  res.json(favouritesCopyState);
});

// Cancel copy (stops between albums)
app.delete("/api/favourites-wizard/copy", (req, res) => {
  if (favouritesCopyState.isCopying) {
    favouritesCopyState.shouldStop = true;
    res.json({ ok: true, message: "Stopping after current album" });
  } else {
    res.json({ ok: true, message: "No favourites copy in progress" });
  }
});

// ============================================================
// Album Deleter - swipe game + confirmed move-to-Trash batch
// ============================================================

let deletionState = {
  isDeleting: false,
  current: 0,
  total: 0,
  deleted: 0,
  failed: 0,
  currentAlbum: null,
  shouldStop: false,
  error: null,
  scanTriggered: false,
  plexTrashEmptied: false,
  results: [],
  libraryId: null,
};

/** Resolve the library every deleter route needs; 400s and returns null on problems. */
async function resolveDeleterLibrary(req, res) {
  const libraryId = req.query.libraryId || req.body?.libraryId;
  if (!libraryId) {
    res.status(400).json({ error: "libraryId is required" });
    return null;
  }
  const library = await loadLibrary(libraryId);
  if (!library) {
    res.status(400).json({ error: "Library not found" });
    return null;
  }
  return library;
}

// Next batch of unjudged albums (judging advances the feed)
app.get("/api/deletion-wizard/candidates", async (req, res) => {
  try {
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const server = await getServerConnection(library.server);
    const section = await getLibrarySection(library);
    const [{ albums, pagination }, swipes] = await Promise.all([
      getPlexAlbums(server, section, {
        limit: 100000,
        sort: "titleSort",
        sortDirection: "asc",
      }),
      prisma.deletionSwipe.findMany({
        where: { libraryId: library.id },
        select: { ratingKey: true, decision: true },
      }),
    ]);

    const judgedKeys = new Set(swipes.map(s => s.ratingKey));
    const marked = swipes.filter(s => s.decision === "DELETE").length;
    const unjudged = albums.filter(album => !judgedKeys.has(String(album.id)));

    res.json({
      candidates: unjudged.slice(0, limit).map(a => ({
        ratingKey: String(a.id),
        title: a.title,
        artist: a.artist,
        year: a.year,
        genre: a.genre,
        artworkUrl: a.artworkUrl,
        location: a.location,
      })),
      remaining: unjudged.length,
      totals: {
        sourceTotal: pagination.total,
        judged: judgedKeys.size,
        kept: marked, // "kept" = albums swiped right (marked for deletion)
        skipped: judgedKeys.size - marked,
      },
    });
  } catch (error) {
    console.error("Error fetching deletion candidates:", error);
    res.status(500).json({ error: error.message });
  }
});

// Record a swipe (DELETE or SKIP)
app.post("/api/deletion-wizard/decisions", async (req, res) => {
  try {
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;
    const { ratingKey, decision, title, artist, location } = req.body || {};

    if (!ratingKey || !["DELETE", "SKIP"].includes(decision)) {
      return res.status(400).json({ error: "ratingKey and a DELETE/SKIP decision are required" });
    }

    const pairKey = { libraryId: library.id, ratingKey: String(ratingKey) };
    await prisma.deletionSwipe.upsert({
      where: { libraryId_ratingKey: pairKey },
      create: {
        ...pairKey,
        title: title || "",
        artist: artist || "",
        location: location || null,
        decision,
        deleteStatus: decision === "DELETE" ? "PENDING" : null,
      },
      update: {
        title: title || "",
        artist: artist || "",
        location: location || null,
        decision,
        deleteStatus: decision === "DELETE" ? "PENDING" : null,
        deleteError: null,
      },
    });

    const shortlistCount = await prisma.deletionSwipe.count({
      where: { libraryId: library.id, decision: "DELETE" },
    });
    res.json({ ok: true, shortlistCount });
  } catch (error) {
    console.error("Error recording deletion decision:", error);
    res.status(500).json({ error: error.message });
  }
});

// Undo a swipe (album re-enters the feed)
app.delete("/api/deletion-wizard/decisions", async (req, res) => {
  try {
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;
    const { ratingKey } = req.query;
    if (!ratingKey) return res.status(400).json({ error: "ratingKey is required" });

    await prisma.deletionSwipe.deleteMany({
      where: { libraryId: library.id, ratingKey: String(ratingKey) },
    });
    const shortlistCount = await prisma.deletionSwipe.count({
      where: { libraryId: library.id, decision: "DELETE" },
    });
    res.json({ ok: true, shortlistCount });
  } catch (error) {
    console.error("Error undoing deletion decision:", error);
    res.status(500).json({ error: error.message });
  }
});

// Albums marked for deletion + per-status counts (review screen, resume, summary)
app.get("/api/deletion-wizard/marked", async (req, res) => {
  try {
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;

    const [marked, judged] = await Promise.all([
      prisma.deletionSwipe.findMany({
        where: { libraryId: library.id, decision: "DELETE" },
        orderBy: { updatedAt: "asc" },
      }),
      prisma.deletionSwipe.count({ where: { libraryId: library.id } }),
    ]);

    // Artwork for the review grid. Built from the ratingKey (Plex serves the
    // current thumb without a timestamp); best-effort if the server is offline.
    let artworkFor = () => null;
    try {
      const server = await getServerConnection(library.server);
      artworkFor = ratingKey =>
        server.url(`/library/metadata/${ratingKey}/thumb`, true).toString();
    } catch {
      // Server unreachable: cards fall back to their placeholder icon.
    }

    const counts = { pending: 0, deleted: 0, failed: 0 };
    for (const row of marked) {
      if (row.deleteStatus === "PENDING") counts.pending++;
      else if (row.deleteStatus === "DELETED") counts.deleted++;
      else if (row.deleteStatus === "FAILED") counts.failed++;
    }
    res.json({
      marked: marked.map(row => ({ ...row, artworkUrl: artworkFor(row.ratingKey) })),
      counts,
      judged,
    });
  } catch (error) {
    console.error("Error fetching deletion list:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk-clear swipe decisions. scope=marked unmarks not-yet-deleted DELETE rows
// (albums re-enter the feed); scope=all forgets every judgment for the library.
app.delete("/api/deletion-wizard/decisions/all", async (req, res) => {
  try {
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;
    const scope = req.query.scope || "marked";
    if (!["marked", "all"].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'marked' or 'all'" });
    }

    const where =
      scope === "all"
        ? { libraryId: library.id }
        : {
            libraryId: library.id,
            decision: "DELETE",
            deleteStatus: { in: ["PENDING", "FAILED"] },
          };
    const { count } = await prisma.deletionSwipe.deleteMany({ where });
    res.json({ ok: true, cleared: count });
  } catch (error) {
    console.error("Error clearing deletion decisions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Execute the confirmed deletion (fire-and-forget; poll progress)
app.post("/api/deletion-wizard/execute", async (req, res) => {
  try {
    if (deletionState.isDeleting) {
      return res.status(409).json({ error: "A deletion is already in progress" });
    }
    const library = await resolveDeleterLibrary(req, res);
    if (!library) return;

    // FAILED rows are included so re-running retries them
    const rows = await prisma.deletionSwipe.findMany({
      where: {
        libraryId: library.id,
        decision: "DELETE",
        deleteStatus: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { updatedAt: "asc" },
    });

    deletionState = {
      isDeleting: true,
      current: 0,
      total: rows.length,
      deleted: 0,
      failed: 0,
      currentAlbum: null,
      shouldStop: false,
      error: null,
      scanTriggered: false,
      plexTrashEmptied: false,
      results: [],
      libraryId: library.id,
    };

    res.json({ started: true, total: rows.length });

    runDeletion(deletionState, library, rows)
      .catch(err => {
        console.error("Deletion run failed:", err);
        deletionState.error = err.message;
      })
      .finally(() => {
        deletionState.isDeleting = false;
        deletionState.currentAlbum = null;
      });
  } catch (error) {
    console.error("Error starting deletion:", error);
    res.status(500).json({ error: error.message });
  }
});

// Deletion progress
app.get("/api/deletion-wizard/execute/progress", (req, res) => {
  res.json(deletionState);
});

// Cancel deletion (stops between albums)
app.delete("/api/deletion-wizard/execute", (req, res) => {
  if (deletionState.isDeleting) {
    deletionState.shouldStop = true;
    res.json({ ok: true, message: "Stopping after current album" });
  } else {
    res.json({ ok: true, message: "No deletion in progress" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message,
  });
});

app
  .listen(PORT, () => {
    console.log(`🎵 Music Tagger API server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  })
  .on("error", err => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use. Run: npm run kill:backend`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });
