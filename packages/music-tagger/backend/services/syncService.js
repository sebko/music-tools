/**
 * Sync Service - Shared logic for syncing album metadata to Plex
 *
 * This service provides a centralized function for syncing metadata that is used by:
 * - Individual album sync endpoint (POST /api/albums/:id/metadata/apply)
 * - Bulk sync endpoint (POST /api/albums/bulk-sync)
 */

import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { getPlexAlbum } from "./plexClient.js";
import { writePlexMetadata } from "./plexMetadataWriter.js";

const prisma = new PrismaClient();

/**
 * Sync album metadata to Plex
 *
 * This function:
 * 1. Validates the album exists in Plex
 * 2. Writes metadata to Plex using writePlexMetadata()
 * 3. Updates the album status to SYNCED in the database
 * 4. Records which fields were synced in redacted_plex_syncs table
 *
 * @param {string} albumId - Plex album rating key
 * @param {Object} metadata - Metadata object to sync (can be partial)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.skipStatusUpdate - Skip updating album status in DB (default: false)
 * @param {Object} options.selectedFields - Object indicating which fields were selected for sync
 * @returns {Promise<Object>} Result with success status and details
 */
export async function syncAlbumToPlex(albumId, metadata, options = {}) {
  const { skipStatusUpdate = false, selectedFields = null } = options;

  console.log(`\n🔄 syncAlbumToPlex called for album: ${albumId}`);
  console.log(`   Metadata keys:`, Object.keys(metadata));

  try {
    // 1. Validate album exists in Plex
    const album = await getPlexAlbum(albumId);

    if (!album) {
      throw new Error("Album not found in Plex");
    }

    // 2. Write metadata to Plex
    const plexResult = await writePlexMetadata(albumId, metadata);

    if (!plexResult.success) {
      throw new Error(plexResult.error || "Failed to write Plex metadata");
    }

    // 3. Update album status to SYNCED in database (unless skipped)
    if (!skipStatusUpdate) {
      try {
        const existingAlbum = await prisma.album.findUnique({
          where: { plexRatingKey: albumId },
        });

        if (existingAlbum) {
          await prisma.album.update({
            where: { plexRatingKey: albumId },
            data: {
              matchStatus: "SYNCED",
              syncedAt: new Date(),
            },
          });
          console.log(`   ✅ Album status updated to SYNCED`);

          // Record which fields were synced in redacted_plex_syncs table
          if (selectedFields) {
            try {
              // Get existing synced fields to merge with new ones
              const existingSync = await prisma.redactedPlexSync.findUnique({
                where: { albumId: existingAlbum.id },
              });

              const existingSyncedFields = existingSync
                ? JSON.parse(existingSync.syncedFields || "{}")
                : {};

              // Merge existing with new - new selections override existing
              const mergedSyncedFields = {
                ...existingSyncedFields,
                ...selectedFields,
              };

              await prisma.redactedPlexSync.upsert({
                where: { albumId: existingAlbum.id },
                create: {
                  albumId: existingAlbum.id,
                  syncedFields: JSON.stringify(mergedSyncedFields),
                  lastSyncedAt: new Date(),
                },
                update: {
                  syncedFields: JSON.stringify(mergedSyncedFields),
                  lastSyncedAt: new Date(),
                },
              });
              console.log(`   ✅ Synced fields recorded:`, mergedSyncedFields);
            } catch (syncRecordError) {
              console.log(`   ⚠️ Failed to record synced fields: ${syncRecordError.message}`);
              // Don't fail the whole operation if recording fails
            }
          }
        } else {
          console.log(`   ⚠️ Album with plexRatingKey "${albumId}" not found in database`);
        }
      } catch (dbError) {
        console.log(`   ⚠️ Failed to update album status: ${dbError.message}`);
        // Don't fail the whole operation if status update fails
      }
    }

    return {
      success: true,
      albumId,
      message: "Metadata synced to Plex successfully",
      fieldsUpdated: plexResult.fieldsUpdated,
    };
  } catch (error) {
    console.error(`   ❌ syncAlbumToPlex error:`, error.message);
    return {
      success: false,
      albumId,
      error: error.message,
      message: `Failed to sync metadata: ${error.message}`,
    };
  }
}

export default { syncAlbumToPlex };
