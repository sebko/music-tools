/**
 * File Metadata Reader - Extract ID3/Vorbis tags from audio files
 *
 * Reads actual metadata stored in audio files (MP3, FLAC, etc.)
 * This shows what's ACTUALLY in the files, vs what Plex has cached.
 */

import { parseFile } from "music-metadata";
import { readdir } from "fs/promises";
import { join } from "path";

/**
 * Read metadata from the first audio file in an album directory
 * Album metadata is duplicated across all tracks, so reading one is sufficient
 *
 * @param {string} albumPath - Full path to album directory
 * @returns {Promise<Object|null>} Album metadata from file tags
 */
export async function readAlbumMetadataFromFiles(albumPath) {
  try {
    console.log(`📁 Reading file metadata from: ${albumPath}`);

    // Get all files in the album directory
    const files = await readdir(albumPath);

    // Filter to audio files only
    const audioExtensions = [
      ".flac",
      ".mp3",
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
      .sort(); // Sort to get consistent first file

    if (audioFiles.length === 0) {
      console.warn(`No audio files found in ${albumPath}`);
      return null;
    }

    // Read metadata from first audio file
    const firstFile = join(albumPath, audioFiles[0]);
    console.log(`🎵 Reading tags from: ${audioFiles[0]}`);

    const metadata = await parseFile(firstFile);
    const { common, format } = metadata;

    // Extract album-level metadata
    // These fields should be identical across all tracks in the album
    const albumMetadata = {
      // Core album fields
      title: common.album || null,
      artist: common.albumartist || common.artist || null,
      year: common.year || null,
      genre: common.genre?.join(", ") || null,

      // Label and catalog info
      label: common.label?.join(", ") || null,
      catalogNumber: common.catalognumber || null,

      // Credits (may be album-wide or track-specific)
      // Reading from first track - if identical across all tracks, it's album-level
      composer: common.composer?.join(", ") || null,
      conductor: common.conductor || null,
      producer: common.producer?.join(", ") || null,
      remixer: common.remixer?.join(", ") || null,

      // Additional metadata
      trackCount: common.track?.total || audioFiles.length, // Total tracks from tag or file count
      date: common.date || null,
      comment: common.comment?.join(" ") || null,

      // File format info (for display purposes)
      format: format.container || format.codec || null,
      bitrate: format.bitrate || null,
      sampleRate: format.sampleRate || null,

      // Artwork availability
      hasArtwork: common.picture && common.picture.length > 0,

      // Source info
      source: "file",
      filePath: firstFile,
    };

    console.log(
      `✅ Read file metadata: ${albumMetadata.artist} - ${albumMetadata.title} (${albumMetadata.year || "no year"})`
    );

    return albumMetadata;
  } catch (error) {
    console.error(`Error reading file metadata from ${albumPath}:`, error);
    return null;
  }
}

/**
 * Extract embedded artwork from the first audio file in an album directory
 *
 * @param {string} albumPath - Full path to album directory
 * @returns {Promise<{data: Buffer, format: string} | null>} Artwork buffer and MIME type, or null
 */
export async function getEmbeddedArtwork(albumPath) {
  try {
    const files = await readdir(albumPath);

    const audioExtensions = [
      ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".aac", ".alac", ".ape", ".wv",
    ];
    const audioFiles = files
      .filter(file => {
        const lowerFile = file.toLowerCase();
        return audioExtensions.some(ext => lowerFile.endsWith(ext));
      })
      .sort();

    if (audioFiles.length === 0) return null;

    const firstFile = join(albumPath, audioFiles[0]);
    const metadata = await parseFile(firstFile);
    const picture = metadata.common.picture?.[0];

    if (!picture || !picture.data) return null;

    return {
      data: picture.data,
      format: picture.format || "image/jpeg",
    };
  } catch (error) {
    console.error(`Error extracting embedded artwork from ${albumPath}:`, error);
    return null;
  }
}

/**
 * Read metadata from ALL audio files to verify consistency
 * Useful for detecting inconsistent tagging across an album
 *
 * @param {string} albumPath - Full path to album directory
 * @returns {Promise<Object>} Object with common values and inconsistencies
 */
export async function readAllTracksMetadata(albumPath) {
  try {
    const files = await readdir(albumPath);

    const audioExtensions = [
      ".flac",
      ".mp3",
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
      return { tracks: [], commonValues: {}, inconsistencies: [] };
    }

    // Read all tracks
    const tracks = [];
    for (const file of audioFiles) {
      const filePath = join(albumPath, file);
      try {
        const metadata = await parseFile(filePath);
        tracks.push({
          file,
          metadata: metadata.common,
        });
      } catch (error) {
        console.warn(`Failed to read ${file}:`, error.message);
      }
    }

    // Check for consistency across album-level fields
    const fieldsToCheck = [
      "album",
      "albumartist",
      "year",
      "genre",
      "label",
      "composer",
      "conductor",
      "producer",
    ];
    const inconsistencies = [];
    const commonValues = {};

    for (const field of fieldsToCheck) {
      const values = new Set();
      tracks.forEach(track => {
        const value = track.metadata[field];
        if (value) {
          values.add(Array.isArray(value) ? value.join(", ") : value.toString());
        }
      });

      if (values.size === 1) {
        // Consistent across all tracks
        commonValues[field] = [...values][0];
      } else if (values.size > 1) {
        // Inconsistent!
        inconsistencies.push({
          field,
          values: [...values],
        });
      }
    }

    return {
      tracks: tracks.map(t => ({ file: t.file })),
      commonValues,
      inconsistencies,
    };
  } catch (error) {
    console.error(`Error reading all tracks from ${albumPath}:`, error);
    throw error;
  }
}
