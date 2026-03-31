import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

/**
 * Get metadata service matches for an album by Plex rating key
 * @param {string} plexRatingKey - The Plex rating key (album ID from Plex)
 * @returns {Promise<Array<{service: string, externalId: string}>>} Array of metadata matches
 */
export async function getAlbumMetadataMatches(plexRatingKey) {
  try {
    // Step 1: Find the album in enhancement layer using Plex rating key
    const album = await prisma.album.findUnique({
      where: {
        plexRatingKey: plexRatingKey,
      },
      include: {
        metadataMatches: {
          include: {
            metadataService: true,
          },
        },
      },
    });

    // Step 2: If album not found in enhancement layer, return empty array
    if (!album) {
      return [];
    }

    // Step 3: Transform matches to simple format
    const matches = album.metadataMatches.map(match => ({
      service: match.metadataService.name,
      externalId: match.externalId,
    }));

    return matches;
  } catch (error) {
    console.error("Error fetching album metadata matches:", error);
    return [];
  }
}

/**
 * Record a metadata service match for an album
 * Creates or updates the match record in the database
 *
 * @param {string} plexRatingKey - The Plex rating key (album ID from Plex)
 * @param {string} serviceName - Name of the metadata service (e.g., "Redacted")
 * @param {string} externalId - External ID in the metadata service (e.g., Redacted groupId)
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function recordMetadataMatch(plexRatingKey, serviceName, externalId) {
  try {
    // Validate externalId is not undefined/null/empty
    if (!externalId || externalId === 'undefined' || externalId === 'null') {
      console.log(`  ⚠️  Invalid externalId (${externalId}) - skipping match record`);
      return {
        success: false,
        error: `Invalid externalId: ${externalId}`,
      };
    }

    console.log(
      `\n📝 Recording metadata match: ${serviceName} ID ${externalId} for album ${plexRatingKey}`
    );

    // Step 1: Find the album in enhancement layer (it should already exist from library scan)
    const album = await prisma.album.findUnique({
      where: {
        plexRatingKey: plexRatingKey,
      },
    });

    if (!album) {
      console.log(`  ⚠️  Album not found in enhancement layer (plexRatingKey: ${plexRatingKey})`);
      return {
        success: false,
        error: "Album not found in enhancement layer",
      };
    }

    console.log(`  ✓ Found album: ${album.artist} - ${album.title}`);

    // Step 2: Find or create the metadata service (normalize to lowercase)
    const normalizedServiceName = serviceName.toLowerCase();
    let metadataService = await prisma.metadataService.findUnique({
      where: {
        name: normalizedServiceName,
      },
    });

    if (!metadataService) {
      console.log(`  Creating new metadata service: ${normalizedServiceName}`);
      metadataService = await prisma.metadataService.create({
        data: {
          name: normalizedServiceName,
        },
      });
    }

    console.log(`  ✓ Using metadata service: ${metadataService.name} (ID: ${metadataService.id})`);

    // Step 3: Create or update the match record using upsert
    // Convert externalId to string to match database schema
    const externalIdString = String(externalId);

    const match = await prisma.albumMetadataServiceMatch.upsert({
      where: {
        albumId_metadataServiceId_externalId: {
          albumId: album.id,
          metadataServiceId: metadataService.id,
          externalId: externalIdString,
        },
      },
      update: {
        // Update timestamp if record already exists
      },
      create: {
        albumId: album.id,
        metadataServiceId: metadataService.id,
        externalId: externalIdString,
      },
    });

    // Step 4: Update album matchStatus to MATCHED (only for Redacted matches)
    // MusicBrainz matches from Plex are informational only and don't change match status
    if (normalizedServiceName === "redacted") {
      await prisma.album.update({
        where: {
          id: album.id,
        },
        data: {
          matchStatus: "MATCHED",
        },
      });
      console.log(`  ✓ Album matchStatus updated to MATCHED`);
    } else {
      console.log(`  ℹ️  Album matchStatus unchanged (only Redacted matches affect status)`);
    }

    console.log(`  ✅ Metadata match recorded successfully (match ID: ${match.id})`);

    return {
      success: true,
      message: "Metadata match recorded successfully",
    };
  } catch (error) {
    console.error("  ❌ Error recording metadata match:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
