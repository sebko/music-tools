import crypto from "crypto";
import fs from "fs/promises";
import { prisma } from "../prisma/client.js";
import { getPlexAlbums, getAlbumLocation, getPlexAlbum, getPlexAlbumArtworkUrls } from "./plexClient.js";
import { recordMetadataMatch } from "./enhancementLayer.js";
import { getImageDimensions } from "./imageDimensions.js";

// Scan progress state
let scanState = {
  isScanning: false,
  totalAlbums: 0,
  processedAlbums: 0,
  currentAlbum: "",
  progress: 0,
  errors: [],
  shouldStop: false,
};

/**
 * Get current scan progress
 * @returns {Object} Current scan state
 */
export function getScanProgress() {
  return { ...scanState };
}

/**
 * Stop the currently running scan
 */
export function stopScan() {
  scanState.shouldStop = true;
}

/**
 * Reset scan state
 */
function resetScanState() {
  scanState = {
    isScanning: false,
    totalAlbums: 0,
    processedAlbums: 0,
    currentAlbum: "",
    progress: 0,
    errors: [],
    shouldStop: false,
  };
}

/**
 * Generate deterministic SHA256 hash of file path
 * @param {string} filePath - Album directory path
 * @returns {string} SHA256 hash
 */
export function hashFilePath(filePath) {
  return crypto.createHash("sha256").update(filePath).digest("hex");
}

/**
 * Parse Plex GUID array to extract metadata service information
 * @param {Array} guidArray - Array of GUID objects from Plex
 * @returns {Array} Array of { service: string, externalId: string }
 */
export function parseGUIDs(guidArray) {
  if (!Array.isArray(guidArray)) {
    return [];
  }

  const services = [];
  const guidPatterns = {
    "mbid://": "musicbrainz",
    "musicbrainz://album/": "musicbrainz",
    "allmusic://": "allmusic",
    "lastfm://": "lastfm",
    "com.plexapp.agents.lastfm://": "lastfm",
    "com.plexapp.agents.plexmusic://": "plexmusic",
  };

  for (const guidObj of guidArray) {
    const guid = guidObj.id;

    // Skip plex:// internal IDs
    if (guid.startsWith("plex://")) {
      continue;
    }

    // Check each pattern
    for (const [pattern, serviceName] of Object.entries(guidPatterns)) {
      if (guid.startsWith(pattern)) {
        const externalId = guid.substring(pattern.length);

        // Only add if we have a valid external ID
        if (externalId && externalId.trim() !== "") {
          services.push({
            service: serviceName,
            externalId: externalId.trim(),
          });
        }
        break;
      }
    }
  }

  return services;
}

/**
 * Ensure metadata service release table exists
 * @param {string} serviceName - Name of metadata service
 */
export async function ensureServiceReleaseTable(serviceName) {
  const tableName = `${serviceName}_releases`;

  // Check if table exists
  const tableExists = await prisma.$queryRawUnsafe(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='${tableName}'
  `);

  if (tableExists.length === 0) {
    console.log(`Creating table: ${tableName}`);

    // Create minimal table with just ID
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "${tableName}" (
        id TEXT PRIMARY KEY
      )
    `);
  }
}

/**
 * Insert release ID into service table if not exists
 * @param {string} serviceName - Name of metadata service
 * @param {string} externalId - External service ID
 */
export async function upsertServiceRelease(serviceName, externalId) {
  const tableName = `${serviceName}_releases`;

  try {
    await prisma.$executeRawUnsafe(
      `
      INSERT OR IGNORE INTO "${tableName}" (id) VALUES (?)
    `,
      externalId
    );
  } catch (error) {
    console.error(`Error inserting into ${tableName}:`, error.message);
  }
}

/**
 * Wipe all enhancement layer tables
 */
export async function wipeEnhancementTables() {
  console.log("Wiping enhancement layer tables...");

  // Delete in order (children first due to foreign keys)
  await prisma.albumMetadataServiceMatch.deleteMany();
  await prisma.album.deleteMany();
  await prisma.metadataService.deleteMany();

  // Drop dynamically created service tables
  const tables = await prisma.$queryRaw`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name LIKE '%_releases'
    AND name NOT IN ('discogs_releases', 'redacted_releases')
  `;

  for (const table of tables) {
    console.log(`Dropping table: ${table.name}`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table.name}"`);
  }

  console.log("Enhancement tables wiped successfully");
}

/**
 * Scan Plex library and populate enhancement layer
 * @returns {Promise<{ albumsScanned: number, servicesDiscovered: number }>}
 */
export async function scanPlexLibrary() {
  try {
    // Reset and initialize scan state
    resetScanState();
    scanState.isScanning = true;

    console.log("Starting Plex library scan...");

    // Step 1: Wipe existing data
    await wipeEnhancementTables();

    // Step 2: Fetch all albums from Plex
    console.log("Fetching albums from Plex...");
    let allAlbums = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore && !scanState.shouldStop) {
      const result = await getPlexAlbums({ page, limit });
      allAlbums = allAlbums.concat(result.albums);

      console.log(
        `Fetched page ${page}: ${result.albums.length} albums (total: ${allAlbums.length})`
      );

      hasMore = result.pagination.hasNext;
      page++;
    }

    // Check if scan was stopped during fetch
    if (scanState.shouldStop) {
      console.log("Scan stopped by user during album fetch");
      scanState.isScanning = false;
      return {
        albumsScanned: 0,
        servicesDiscovered: 0,
      };
    }

    console.log(`Total albums fetched: ${allAlbums.length}`);

    // Update total albums for progress tracking
    scanState.totalAlbums = allAlbums.length;

    // Step 3: Track discovered services
    const discoveredServices = new Set();

    // Step 4: Process each album
    for (const plexAlbum of allAlbums) {
      // Check if scan should stop
      if (scanState.shouldStop) {
        console.log(
          `Scan stopped by user at album ${scanState.processedAlbums}/${scanState.totalAlbums}`
        );
        break;
      }

      // Update current album being processed
      scanState.currentAlbum = plexAlbum.title;
      console.log(
        `Processing album ${scanState.processedAlbums + 1}/${scanState.totalAlbums}: ${plexAlbum.title}`
      );

      try {
        // Fetch full album details to get GUIDs and tracks
        const fullAlbum = await getPlexAlbum(plexAlbum.id);

        if (!fullAlbum) {
          console.warn(`Album ${plexAlbum.id} (${plexAlbum.title}) not found, skipping`);
          scanState.errors.push(`Album "${plexAlbum.title}" not found`);
          continue;
        }

        // Extract location from fullAlbum tracks
        const location = fullAlbum.location || null;

        if (!location) {
          console.warn(`Album ${plexAlbum.id} (${plexAlbum.title}) has no location path, skipping`);
          scanState.errors.push(`Album "${plexAlbum.title}" has no location path`);
          continue;
        }

        // Generate stable ID
        const albumId = hashFilePath(location);

        // Parse GUIDs to extract metadata services
        const metadataServices = parseGUIDs(fullAlbum.guids || []);

        // Extract sortable fields from Plex data
        const year = fullAlbum.year || null;
        const addedAt = fullAlbum.addedAt ? new Date(fullAlbum.addedAt) : null;
        const titleSort = fullAlbum.titleSort || null;
        const genre = fullAlbum.genres && fullAlbum.genres.length > 0 ? fullAlbum.genres[0] : null;

        // Read folder creation date from filesystem
        let folderCreatedAt = null;
        try {
          const stats = await fs.stat(location);
          folderCreatedAt = stats.birthtime;
        } catch (error) {
          console.warn(`Could not read folder stats for ${location}:`, error.message);
        }

        // Create album record
        await prisma.album.create({
          data: {
            id: albumId,
            plexRatingKey: plexAlbum.id,
            filePath: location,
            title: plexAlbum.title || "Unknown Album",
            artist: plexAlbum.artist || "Unknown Artist",
            year,
            addedAt,
            titleSort,
            genre,
            folderCreatedAt,
          },
        });

        // Extract artwork dimensions
        try {
          const artworkUrls = await getPlexAlbumArtworkUrls(plexAlbum.id);
          if (artworkUrls.fullUrl) {
            const dimensions = await getImageDimensions(artworkUrls.fullUrl);
            if (dimensions) {
              await prisma.album.update({
                where: { id: albumId },
                data: {
                  artworkWidth: dimensions.width,
                  artworkHeight: dimensions.height,
                },
              });
            }
          }
        } catch (dimError) {
          console.warn(`Could not extract artwork dimensions for ${plexAlbum.title}:`, dimError.message);
        }

        // Process metadata services
        for (const { service, externalId } of metadataServices) {
          discoveredServices.add(service);

          // Use recordMetadataMatch to ensure matchStatus is updated
          await recordMetadataMatch(plexAlbum.id, service, externalId);

          // Ensure service release table exists
          await ensureServiceReleaseTable(service);

          // Insert into service release table
          await upsertServiceRelease(service, externalId);
        }
      } catch (error) {
        console.error(`Error processing album "${plexAlbum.title}":`, error);
        scanState.errors.push(`Error processing "${plexAlbum.title}": ${error.message}`);
      } finally {
        // Update progress after processing each album
        scanState.processedAlbums++;
        scanState.progress = Math.round((scanState.processedAlbums / scanState.totalAlbums) * 100);
      }
    }

    // Mark scan as complete
    scanState.isScanning = false;
    scanState.currentAlbum = "";

    console.log(
      `Scan complete: ${scanState.processedAlbums} albums processed, ${discoveredServices.size} metadata services`
    );

    return {
      albumsScanned: scanState.processedAlbums,
      servicesDiscovered: discoveredServices.size,
    };
  } catch (error) {
    // Handle any unexpected errors
    console.error("Fatal scan error:", error);
    scanState.isScanning = false;
    scanState.errors.push(`Fatal error: ${error.message}`);
    throw error;
  }
}
