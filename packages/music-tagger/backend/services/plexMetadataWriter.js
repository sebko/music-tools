/**
 * Plex Metadata Writer - Update album metadata in Plex via API
 *
 * Updates Plex's cached metadata for albums WITHOUT modifying actual files.
 * This is useful for correcting Plex's display without touching file tags.
 */

import { getPlexServer } from "./plexClient.js";

/**
 * Format Redacted tags for Plex styles
 * - Capitalize first letter of each word
 * - Replace dots with spaces
 *
 * @param {string} tag - Raw tag from Redacted (e.g., "trip.hop", "latin")
 * @returns {string} Formatted tag (e.g., "Trip Hop", "Latin")
 */
function formatRedactedTag(tag) {
  if (!tag) return tag;

  // Replace dots with spaces
  const withSpaces = tag.replace(/\./g, " ");

  // Capitalize first letter of each word
  const capitalized = withSpaces
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return capitalized;
}

/**
 * Update album metadata in Plex
 * Only updates fields that are present in the metadata object (merge behavior)
 *
 * @param {string} albumId - Plex album rating key
 * @param {Object} metadata - Redacted metadata object (can be partial/diff)
 * @returns {Promise<Object>} Result with success status
 */
export async function writePlexMetadata(albumId, metadata) {
  console.log(`\n📝 Updating Plex metadata for album: ${albumId}`);
  console.log(`   Metadata diff:`, metadata);

  try {
    const server = await getPlexServer();

    // Get album info to retrieve library section ID
    const albumResponse = await server.query(`/library/metadata/${albumId}`);
    const album = albumResponse.MediaContainer?.Metadata?.[0];

    if (!album) {
      throw new Error("Album not found");
    }

    // Album found - proceed with metadata update

    // Build field updates as query parameters
    // Plex uses {field}.value and {field}.locked format
    // Only include fields that are explicitly provided in metadata
    const updates = {};

    // Title - only if explicitly provided
    if (metadata.title !== undefined && metadata.title !== null) {
      updates["title.value"] = metadata.title;
      updates["title.locked"] = "1"; // Lock field to prevent auto-updates
    }

    // Artist (parentTitle is the artist for albums) - only if explicitly provided
    if (metadata.artist !== undefined && metadata.artist !== null) {
      updates["parentTitle.value"] = metadata.artist;
      updates["parentTitle.locked"] = "1";
    }

    // Year - only if explicitly provided
    if (metadata.year !== undefined && metadata.year !== null) {
      updates["year.value"] = metadata.year.toString();
      updates["year.locked"] = "1";
    }

    // Studio (Label) - only if explicitly provided
    if (metadata.label !== undefined && metadata.label !== null) {
      updates["studio.value"] = metadata.label;
      updates["studio.locked"] = "1";
    }

    // Style (comma-separated tags) - only if explicitly provided
    if (metadata.tags !== undefined && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      console.log(`   🏷️  Processing ${metadata.tags.length} style tags:`, metadata.tags);

      // Plex expects style as individual style parameters
      // Based on @ctrl/plex library tagHelper function
      // Format tags: capitalize first letter, replace dots with spaces
      metadata.tags.forEach((tag, index) => {
        const formattedTag = formatRedactedTag(tag);
        const paramKey = `style[${index}].tag.tag`;
        updates[paramKey] = formattedTag;
        console.log(
          `      Adding style parameter: ${paramKey} = "${formattedTag}" (from "${tag}")`
        );
      });
      updates["style.locked"] = "1";
    }

    // Only send PUT request if there are metadata fields to update
    // (coverUrl is not a Plex metadata field, so skip if only coverUrl was provided)
    if (Object.keys(updates).length > 0) {
      // Build query string
      const params = new URLSearchParams(updates);
      const url = `/library/metadata/${albumId}?${params.toString()}`;

      console.log(`   Sending PUT request to: ${url}`);

      // Send PUT request to update metadata
      const response = await server.query(url, "PUT");

      console.log(`   ✅ Plex metadata updated successfully`);
      console.log(`   Response:`, JSON.stringify(response, null, 2));
    } else {
      console.log(`   ⏭️  No metadata fields to update (only artwork)`);
    }

    // Upload album artwork if provided
    if (metadata.coverUrl !== undefined && metadata.coverUrl !== null) {
      try {
        // Check if it's a data URL (base64) or regular HTTP URL
        if (metadata.coverUrl.startsWith("data:")) {
          console.log(`   Uploading album artwork from data URL (custom upload)...`);

          // Extract base64 data from data URL
          const matches = metadata.coverUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) {
            throw new Error("Invalid data URL format");
          }

          const mimeType = matches[1];
          const base64Data = matches[2];
          const imageBuffer = Buffer.from(base64Data, "base64");

          console.log(
            `   Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB, MIME type: ${mimeType}`
          );

          // Binary upload method - upload image data directly to Plex
          const posterUrl = `/library/metadata/${albumId}/posters`;
          await server.query(posterUrl, "post", {
            body: imageBuffer,
            headers: {
              "Content-Type": mimeType,
            },
          });
        } else {
          console.log(`   Uploading album artwork from URL...`);

          // URL-based upload - let Plex download the image from the URL
          const posterUrl = `/library/metadata/${albumId}/posters?url=${encodeURIComponent(metadata.coverUrl)}`;
          await server.query(posterUrl, "POST");
        }

        console.log(`   ✅ Album artwork uploaded successfully`);
      } catch (error) {
        console.error(`   ⚠️ Failed to upload artwork (non-fatal):`, error.message);
        // Don't fail the entire operation if artwork upload fails
      }
    }

    return {
      success: true,
      message: "Plex metadata updated successfully",
      fieldsUpdated: Object.keys(updates).filter(k => !k.endsWith(".locked")).length,
    };
  } catch (error) {
    console.error(`   ❌ Failed to update Plex metadata:`, error);
    return {
      success: false,
      error: error.message,
      message: `Failed to update Plex metadata: ${error.message}`,
    };
  }
}

/**
 * Refresh Plex metadata (triggers re-analysis)
 *
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<Object>} Result with success status
 */
export async function refreshPlexMetadata(albumId) {
  console.log(`\n🔄 Refreshing Plex metadata for album: ${albumId}`);

  try {
    const server = await getPlexServer();

    // Send refresh request
    const url = `/library/metadata/${albumId}/refresh`;
    await server.query(url, "PUT");

    console.log(`   ✅ Plex metadata refresh triggered`);

    return {
      success: true,
      message: "Plex metadata refresh triggered",
    };
  } catch (error) {
    console.error(`   ❌ Failed to refresh Plex metadata:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}
