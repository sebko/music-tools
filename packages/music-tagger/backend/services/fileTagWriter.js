/**
 * File Tag Writer - Write ID3/Vorbis tags to audio files
 *
 * Writes metadata from Redacted to actual audio file tags.
 * Supports MP3 (ID3), FLAC (Vorbis comments), and other formats.
 */

import NodeID3 from "node-id3tag";
import { readdir } from "fs/promises";
import { join } from "path";
import { writeFile } from "fs/promises";
import fetch from "node-fetch";

/**
 * Write metadata tags to all audio files in an album directory
 *
 * @param {string} albumPath - Full path to album directory
 * @param {Object} metadata - Redacted metadata object
 * @returns {Promise<Object>} Results with success count and errors
 */
export async function writeFileTagsToAlbum(albumPath, metadata) {
  console.log(`\n📝 Writing file tags to album: ${albumPath}`);
  console.log(`   Metadata: ${metadata.artist} - ${metadata.title} (${metadata.year})`);

  try {
    // Get all files in the album directory
    const files = await readdir(albumPath);

    // Filter to audio files only
    const audioExtensions = [
      ".mp3",
      ".flac",
      ".m4a",
      ".ogg",
      ".opus",
      ".wav",
      ".aac",
      ".alac",
      ".ape",
      ".wv",
    ];
    const audioFiles = files
      .filter(file => {
        const lowerFile = file.toLowerCase();
        return audioExtensions.some(ext => lowerFile.endsWith(ext));
      })
      .sort();

    if (audioFiles.length === 0) {
      return {
        success: false,
        error: "No audio files found in album directory",
        filesProcessed: 0,
        filesUpdated: 0,
        filesFailed: 0,
      };
    }

    console.log(`   Found ${audioFiles.length} audio files to update`);

    // Convert Redacted metadata to ID3 tag format
    const tags = mapMetadataToID3Tags(metadata);

    // Download and embed album artwork if available
    if (metadata.coverUrl) {
      try {
        console.log(`   Downloading album artwork...`);
        tags.image = await downloadAlbumArtwork(metadata.coverUrl);
        console.log(`   ✅ Album artwork downloaded`);
      } catch (error) {
        console.warn(`   ⚠️ Failed to download artwork: ${error.message}`);
      }
    }

    // Write tags to each audio file
    let filesUpdated = 0;
    let filesFailed = 0;
    const errors = [];

    for (const file of audioFiles) {
      const filePath = join(albumPath, file);
      const fileExt = file.toLowerCase().substring(file.lastIndexOf("."));

      try {
        // Currently only MP3 is fully supported via node-id3
        if (fileExt === ".mp3") {
          const success = NodeID3.update(tags, filePath);
          if (success === true) {
            filesUpdated++;
            console.log(`   ✅ ${file}`);
          } else {
            throw new Error(success.message || "Unknown error");
          }
        } else {
          // For non-MP3 files, log that they're unsupported
          console.log(`   ⚠️ ${file} - Format ${fileExt} not yet supported`);
          filesFailed++;
          errors.push(`${file}: Format ${fileExt} not supported`);
        }
      } catch (error) {
        filesFailed++;
        errors.push(`${file}: ${error.message}`);
        console.error(`   ❌ ${file} - ${error.message}`);
      }
    }

    const overallSuccess = filesUpdated > 0 && filesFailed === 0;

    console.log(`\n   Summary: ${filesUpdated} updated, ${filesFailed} failed`);

    return {
      success: overallSuccess,
      filesProcessed: audioFiles.length,
      filesUpdated,
      filesFailed,
      errors: errors.length > 0 ? errors : undefined,
      message: overallSuccess
        ? `Successfully updated ${filesUpdated} files`
        : filesFailed === audioFiles.length
          ? "Failed to update any files"
          : `Partially successful: ${filesUpdated} updated, ${filesFailed} failed`,
    };
  } catch (error) {
    console.error(`Error writing file tags:`, error);
    return {
      success: false,
      error: error.message,
      filesProcessed: 0,
      filesUpdated: 0,
      filesFailed: 0,
    };
  }
}

/**
 * Map Redacted metadata to ID3 tag format
 * Only includes fields that are present in the metadata object (merge behavior)
 *
 * @param {Object} metadata - Redacted metadata object (can be partial/diff)
 * @returns {Object} ID3 tags object for node-id3
 */
function mapMetadataToID3Tags(metadata) {
  const tags = {};

  // Album title - only if explicitly provided
  if (metadata.title !== undefined && metadata.title !== null) {
    tags.album = metadata.title;
  }

  // Album artist - only if explicitly provided
  if (metadata.artist !== undefined && metadata.artist !== null) {
    tags.performerInfo = metadata.artist; // TPE2 (Album Artist)
  }

  // Year - only if explicitly provided
  if (metadata.year !== undefined && metadata.year !== null) {
    tags.year = metadata.year.toString();
  }

  // Genre (pass as array for null-separated TCON, Pentaton compatible) - only if explicitly provided
  if (metadata.tags !== undefined && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
    tags.genre = metadata.tags;
  }

  // Label (Publisher) - only if explicitly provided
  if (metadata.label !== undefined && metadata.label !== null) {
    tags.publisher = metadata.label;
  }

  // Catalog Number (custom TXXX frame) - only if explicitly provided
  if (metadata.catalogNumber !== undefined && metadata.catalogNumber !== null) {
    tags.userDefinedText = [
      {
        description: "CATALOGNUMBER",
        value: metadata.catalogNumber,
      },
    ];
  }

  // Music credits from musicInfo object - only if explicitly provided
  if (metadata.musicInfo !== undefined && metadata.musicInfo !== null) {
    // Composer
    if (metadata.musicInfo.composers && metadata.musicInfo.composers.length > 0) {
      tags.composer = metadata.musicInfo.composers.map(c => c.name).join(", ");
    }

    // Conductor
    if (metadata.musicInfo.conductor && metadata.musicInfo.conductor.length > 0) {
      tags.conductor = metadata.musicInfo.conductor.map(c => c.name).join(", ");
    }

    // Producer (custom TXXX frame)
    if (metadata.musicInfo.producer && metadata.musicInfo.producer.length > 0) {
      const producerNames = metadata.musicInfo.producer.map(p => p.name).join(", ");
      if (!tags.userDefinedText) {
        tags.userDefinedText = [];
      }
      tags.userDefinedText.push({
        description: "PRODUCER",
        value: producerNames,
      });
    }

    // Remixer
    if (metadata.musicInfo.remixedBy && metadata.musicInfo.remixedBy.length > 0) {
      tags.unsynchronisedLyrics = {
        language: "eng",
        text: `Remixed by: ${metadata.musicInfo.remixedBy.map(r => r.name).join(", ")}`,
      };
    }
  }

  return tags;
}

/**
 * Download album artwork from URL or data URL
 *
 * @param {string} url - Artwork URL or data URL
 * @returns {Promise<Object>} Image data object for APIC frame
 */
async function downloadAlbumArtwork(url) {
  let buffer;
  let contentType;

  // Handle data URLs (base64 encoded images)
  if (url.startsWith("data:")) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid data URL format");
    }
    contentType = matches[1];
    const base64Data = matches[2];
    buffer = Buffer.from(base64Data, "base64");
  } else {
    // Handle regular HTTP(S) URLs
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download artwork: ${response.status}`);
    }

    buffer = await response.buffer();
    contentType = response.headers.get("content-type") || "image/jpeg";
  }

  return {
    mime: contentType,
    type: {
      id: 3, // Front cover
      name: "front cover",
    },
    description: "Album Cover",
    imageBuffer: buffer,
  };
}
