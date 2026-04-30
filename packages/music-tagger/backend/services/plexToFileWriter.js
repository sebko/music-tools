/**
 * Plex to File Writer - Write Plex metadata to local audio file tags
 *
 * Syncs metadata from Plex (genres, styles, etc.) to ID3/Vorbis tags
 * in local audio files. Supports MP3 (ID3) and FLAC (Vorbis comments).
 */

import NodeID3 from "node-id3tag";
import { readdir, rename, stat, unlink } from "fs/promises";
import { join, extname } from "path";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { fetchImage, embedArtworkToFile } from "./artwork/artworkManager.js";
import { captureTimestamps, restoreTimestamps } from "./timestamps.js";
import { computeAudioStreamHash } from "./audioIntegrity.js";
import { recoverMP3Tags } from "./id3Recovery.js";
import { basename } from "path";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Merge Plex genres and styles into a single array
 * Deduplicates and preserves order (genres first, then styles)
 *
 * @param {Object} plexAlbum - Plex album object with genres and styles arrays
 * @returns {string[]} Merged and deduplicated array
 */
export function mergeGenresAndStyles(plexAlbum) {
  const genres = plexAlbum.genres || [];
  const styles = plexAlbum.styles || [];
  // Combine and deduplicate while preserving order
  const merged = [...new Set([...genres, ...styles])];
  return merged;
}

/**
 * Read existing genres from a FLAC file using metaflac CLI
 *
 * @param {string} filePath - Full path to FLAC file
 * @returns {Promise<string[]>} Array of genre strings
 */
async function readGenresFromFLAC(filePath) {
  try {
    // Use execFile to prevent shell injection (no escaping needed)
    const { stdout } = await execFileAsync('metaflac', ['--show-tag=GENRE', filePath]);
    // Output format: GENRE=Rock\nGENRE=Electronic\n
    return stdout
      .split("\n")
      .filter((line) => line.startsWith("GENRE="))
      .map((line) => line.substring(6).trim())
      .filter(Boolean);
  } catch {
    // If metaflac fails or no genres exist, return empty array
    return [];
  }
}

/**
 * Read existing genres from an M4A file using AtomicParsley CLI
 *
 * @param {string} filePath - Full path to M4A file
 * @returns {Promise<string[]>} Array of genre strings
 */
async function readGenresFromM4A(filePath) {
  try {
    const { stdout } = await execFileAsync('AtomicParsley', [filePath, '-t']);
    // Output format: Atom "©gen" contains: Rock;Electronic
    const genreMatch = stdout.match(/Atom "©gen" contains: (.+)/);
    if (!genreMatch) return [];
    return genreMatch[1].split(/[;,]/).map(g => g.trim()).filter(Boolean);
  } catch {
    // If AtomicParsley fails or no genres exist, return empty array
    return [];
  }
}

/**
 * Read existing genres from an MP3 file using node-id3
 *
 * @param {string} filePath - Full path to MP3 file
 * @returns {string[]} Array of genre strings
 */
function readGenresFromMP3(filePath) {
  try {
    const tags = NodeID3.read(filePath);
    if (!tags.genre) return [];
    // node-id3tag returns an array for null-separated TCON, or a string for legacy
    if (Array.isArray(tags.genre)) return tags.genre.filter(Boolean);
    return tags.genre
      .split(/[;,]/)
      .map((g) => g.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Normalize a genre string to Title Case
 * Handles: "hip hop" → "Hip Hop", "trip.hop" → "Trip Hop"
 *
 * @param {string} genre - Raw genre string
 * @returns {string} Normalized genre in Title Case
 */
function normalizeGenre(genre) {
  if (!genre) return genre;

  // Replace dots with spaces (in case any slip through from Redacted)
  const withSpaces = genre.replace(/\./g, " ");

  // Title case each word
  return withSpaces
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Merge and deduplicate genres (case-insensitive)
 * Normalizes all genres to Title Case, deduplicates, and sorts alphabetically
 *
 * @param {string[]} existingGenres - Genres from local file
 * @param {string[]} plexGenres - Genres from Plex
 * @returns {string[]} Normalized, deduplicated, sorted array
 */
function mergeAndNormalizeGenres(existingGenres, plexGenres) {
  // Normalize all genres
  const normalizedExisting = existingGenres.map(normalizeGenre);
  const normalizedPlex = plexGenres.map(normalizeGenre);

  // Merge and deduplicate (case-insensitive using lowercase key)
  const genreMap = new Map();
  [...normalizedExisting, ...normalizedPlex].forEach((genre) => {
    const key = genre.toLowerCase();
    if (!genreMap.has(key)) {
      genreMap.set(key, genre);
    }
  });

  // Return sorted array
  return Array.from(genreMap.values()).sort();
}

/**
 * Write Vorbis tags to a FLAC file using metaflac CLI
 *
 * @param {string} filePath - Full path to FLAC file
 * @param {Object} tags - Object with tag names and values { GENRE: "Rock;Electronic", ... }
 */
async function writeVorbisTagsFLAC(filePath, tags) {
  // Use execFile to prevent shell injection (no escaping needed)

  for (const [tagName, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue;

    try {
      // Remove existing tag first (ignore error if it doesn't exist)
      await execFileAsync('metaflac', [`--remove-tag=${tagName}`, filePath]);
    } catch {
      // Ignore - tag may not exist
    }

    // Set new tag value
    // For arrays (like genres), we set multiple tags with the same name
    if (Array.isArray(value)) {
      for (const v of value) {
        await execFileAsync('metaflac', [`--set-tag=${tagName}=${v}`, filePath]);
      }
    } else {
      await execFileAsync('metaflac', [`--set-tag=${tagName}=${value}`, filePath]);
    }
  }
}

/**
 * Write tags to an M4A file using AtomicParsley CLI
 *
 * Uses safe atomic file replacement to avoid padding issues:
 * 1. Capture original file timestamps (birthtime + mtime)
 * 2. Write to temp file using -o flag
 * 3. Verify temp file was created and has content
 * 4. Atomic rename to replace original
 * 5. Restore original timestamps so "date created" is preserved
 *
 * @param {string} filePath - Full path to M4A file
 * @param {Object} tags - Object with tag names and values { genre: "Rock;Electronic", ... }
 */
async function writeTagsM4A(filePath, tags) {
  const tempPath = filePath + '.atomicparsley-temp';
  const args = [filePath, '-o', tempPath];

  if (tags.genre) {
    args.push('--genre', tags.genre);
  }
  if (tags.album) {
    args.push('--album', tags.album);
  }
  if (tags.albumArtist) {
    args.push('--artist', tags.albumArtist);
  }
  if (tags.year) {
    args.push('--year', tags.year);
  }

  // Capture original timestamps before replacement
  const originalTimestamps = await captureTimestamps(filePath);

  try {
    await execFileAsync('AtomicParsley', args);

    // Safety check: verify temp file was created and has content
    const tempStat = await stat(tempPath);
    if (tempStat.size === 0) {
      throw new Error('AtomicParsley created empty temp file');
    }

    // Atomic replacement - original only deleted if this succeeds
    await rename(tempPath, filePath);

    // Restore original timestamps (birthtime + mtime)
    await restoreTimestamps(filePath, originalTimestamps);
  } catch (error) {
    // Cleanup temp file on any error (original is safe)
    try { await unlink(tempPath); } catch {}
    throw error;
  }
}

/**
 * Write ID3 tags to an MP3 file using node-id3.
 *
 * Handles two categories of malformation seen in the wild:
 *   1. Malformed GEOB frames (e.g. from Serato) — filtered after
 *      a successful read.
 *   2. Malformed frame-size fields that make NodeID3.read() throw
 *      outright. When that happens we fall back to ffmpeg-based
 *      permissive recovery (see id3Recovery.js), then let
 *      NodeID3.write() rebuild the tag region from scratch. It's
 *      safe because write() strips the old tag positionally via
 *      the outer 10-byte ID3v2 header — never touching audio.
 *
 * @param {string} filePath - Full path to MP3 file
 * @param {Object} tags - Object with ID3 tag names and values
 * @returns {Promise<{ success: true, repaired: boolean }>}
 */
async function writeID3TagsMP3(filePath, tags) {
  let existingTags;
  let repaired = false;
  try {
    existingTags = NodeID3.read(filePath) || {};
  } catch (readErr) {
    const recovery = await recoverMP3Tags(filePath);
    existingTags = recovery.tags;
    repaired = true;
    console.warn(
      `   🔧 Repaired malformed ID3 in ${basename(filePath)} ` +
      `(recovered ${recovery.recoveredKeys.length} field(s)` +
      `${recovery.hasArt ? " + album art" : ""}; original read error: ${readErr.message})`
    );
  }

  // Filter out malformed GEOB frames (missing encapsulatedObject)
  // These cause node-id3 to crash when trying to rewrite them
  if (existingTags.generalObject) {
    existingTags.generalObject = existingTags.generalObject.filter(
      frame => frame.encapsulatedObject !== undefined
    );
    // Remove entirely if empty after filtering
    if (existingTags.generalObject.length === 0) {
      delete existingTags.generalObject;
    }
  }

  // Merge new tags with existing (new tags take precedence)
  const mergedTags = { ...existingTags, ...tags };

  // Remove raw field - it's read-only and shouldn't be written
  delete mergedTags.raw;

  const success = NodeID3.write(mergedTags, filePath);
  if (success !== true) {
    throw new Error(success?.message || "Failed to write ID3 tags");
  }

  return { success: true, repaired };
}

/**
 * Map Plex metadata to tag format based on selected fields
 *
 * @param {Object} plexAlbum - Plex album metadata
 * @param {Object} selectedFields - Which fields to sync { genre: true, ... }
 * @param {string} format - "mp3", "flac", or "m4a"
 * @param {string[]} existingGenres - Existing genres from the file (for merging)
 * @returns {Object} Tags object for the appropriate format
 */
function mapPlexMetadataToTags(plexAlbum, selectedFields, format, existingGenres = []) {
  const tags = {};

  if (selectedFields.genre) {
    const plexGenres = mergeGenresAndStyles(plexAlbum);
    // Merge with existing file genres, normalize, and deduplicate
    const merged = mergeAndNormalizeGenres(existingGenres, plexGenres);
    if (merged.length > 0) {
      if (format === "flac") {
        // FLAC: Pass as array - writeVorbisTagsFLAC handles multiple GENRE tags
        tags.GENRE = merged;
      } else if (format === "m4a") {
        // M4A: AtomicParsley expects a single string
        tags.genre = merged.join("; ");
      } else {
        // MP3: Pass as array - node-id3tag writes null-separated TCON (Pentaton compatible)
        tags.genre = merged;
      }
    }
  }

  // Future fields - currently not implemented but structure is here
  if (selectedFields.title && plexAlbum.title) {
    if (format === "flac") {
      tags.ALBUM = plexAlbum.title;
    } else {
      tags.album = plexAlbum.title;
    }
  }

  if (selectedFields.artist && plexAlbum.artist) {
    if (format === "flac") {
      tags.ALBUMARTIST = plexAlbum.artist;
    } else if (format === "m4a") {
      tags.albumArtist = plexAlbum.artist;
    } else {
      tags.performerInfo = plexAlbum.artist; // TPE2
    }
  }

  if (selectedFields.year && plexAlbum.year) {
    if (format === "flac") {
      tags.DATE = plexAlbum.year.toString();
    } else {
      tags.year = plexAlbum.year.toString();
    }
  }

  if (selectedFields.studio && plexAlbum.studio) {
    if (format === "flac") {
      tags.LABEL = plexAlbum.studio;
    } else {
      tags.publisher = plexAlbum.studio;
    }
  }

  return tags;
}

/**
 * Write Plex metadata to all audio files in an album directory
 *
 * @param {string} albumPath - Full path to album directory
 * @param {Object} plexAlbum - Plex album metadata from getPlexAlbum()
 * @param {Object} selectedFields - Which fields to sync { genre: true, ... }
 * @returns {Promise<Object>} Results with success count and errors
 */
export async function writePlexMetadataToFiles(albumPath, plexAlbum, selectedFields) {
  console.log(`\n📝 Writing Plex metadata to files: ${albumPath}`);
  console.log(`   Album: ${plexAlbum.artist} - ${plexAlbum.title}`);
  console.log(`   Selected fields:`, Object.keys(selectedFields).filter(k => selectedFields[k]));

  // Log what we're syncing
  if (selectedFields.genre) {
    const merged = mergeGenresAndStyles(plexAlbum);
    console.log(`   Genres + Styles: ${merged.join(", ") || "(none)"}`);
  }

  try {
    // Get all files in the album directory
    const files = await readdir(albumPath);

    // Filter to supported audio files
    const supportedExtensions = [".mp3", ".flac", ".m4a"];
    const audioFiles = files
      .filter(file => {
        const ext = extname(file).toLowerCase();
        return supportedExtensions.includes(ext);
      })
      .sort();

    if (audioFiles.length === 0) {
      return {
        success: false,
        error: "No supported audio files found (MP3/FLAC/M4A only)",
        filesProcessed: 0,
        filesUpdated: 0,
        filesFailed: 0,
      };
    }

    console.log(`   Found ${audioFiles.length} audio files to update`);

    // Pre-fetch artwork once if artwork sync is selected
    let artworkImage = null;
    if (selectedFields.artwork && plexAlbum.artworkUrl) {
      try {
        console.log(`   🎨 Downloading artwork from Plex...`);
        artworkImage = await fetchImage(plexAlbum.artworkUrl);
        console.log(`   🎨 Artwork downloaded (${artworkImage.mime}, ${Math.round(artworkImage.buffer.length / 1024)}KB)`);
      } catch (error) {
        console.error(`   ⚠️ Failed to download artwork: ${error.message}`);
      }
    }

    // Write tags to each audio file
    let filesUpdated = 0;
    let filesFailed = 0;
    let filesRepaired = 0;
    const errors = [];
    const corruptedFiles = [];
    let aborted = false;

    for (const file of audioFiles) {
      if (aborted) break;

      const filePath = join(albumPath, file);
      const ext = extname(file).toLowerCase();
      const format = ext === ".flac" ? "flac" : ext === ".m4a" ? "m4a" : "mp3";

      try {
        // Read existing genres for merge (only if genre sync is enabled)
        let existingGenres = [];
        if (selectedFields.genre) {
          if (format === "flac") {
            existingGenres = await readGenresFromFLAC(filePath);
          } else if (format === "m4a") {
            existingGenres = await readGenresFromM4A(filePath);
          } else {
            existingGenres = readGenresFromMP3(filePath);
          }
        }

        const tags = mapPlexMetadataToTags(plexAlbum, selectedFields, format, existingGenres);

        if (Object.keys(tags).length === 0 && !artworkImage) {
          console.log(`   ⚠️ ${file} - No tags to write`);
          continue;
        }

        // Pre-write: hash audio stream. Throws if the file is already
        // unreadable — we refuse to write over a broken file.
        let preHash;
        try {
          preHash = await computeAudioStreamHash(filePath, format);
        } catch (preErr) {
          filesFailed++;
          errors.push(`${file}: pre-check failed — file already unreadable, skipping write (${preErr.message})`);
          console.error(`   ❌ ${file} - pre-check failed, skipping write: ${preErr.message}`);
          continue;
        }

        // Capture timestamps before writing (FLAC artwork embedding via metaflac
        // rewrites the file with temp+rename, which changes birthtime on APFS)
        const needsTimestampRestore = format === "flac" && (Object.keys(tags).length > 0 || artworkImage);
        const originalTimestamps = needsTimestampRestore ? await captureTimestamps(filePath) : null;

        if (Object.keys(tags).length > 0) {
          if (format === "flac") {
            await writeVorbisTagsFLAC(filePath, tags);
          } else if (format === "m4a") {
            await writeTagsM4A(filePath, tags);
          } else {
            const mp3Result = await writeID3TagsMP3(filePath, tags);
            if (mp3Result.repaired) filesRepaired++;
          }
        }

        // Embed artwork if available
        if (artworkImage) {
          const artResult = await embedArtworkToFile(filePath, artworkImage);
          if (!artResult.success) {
            console.log(`   ⚠️ ${file} - Artwork skipped: ${artResult.error}`);
          }
        }

        // Restore original timestamps (preserves birthtime/date created)
        if (originalTimestamps) {
          await restoreTimestamps(filePath, originalTimestamps);
        }

        // Post-write: hash again and confirm audio stream is byte-identical.
        // Any mismatch — or a failure to even hash — is a corruption event;
        // we abort the rest of the album so the user can investigate
        // before more files are touched.
        let postHash;
        try {
          postHash = await computeAudioStreamHash(filePath, format);
        } catch (postErr) {
          corruptedFiles.push(file);
          filesFailed++;
          errors.push(`CORRUPTION: ${file} — post-write hash failed (${postErr.message}). preHash=${preHash}`);
          console.error(`   🚨 CORRUPTION DETECTED: ${file}`);
          console.error(`      post-write hash threw: ${postErr.message}`);
          console.error(`      preHash=${preHash}`);
          aborted = true;
          break;
        }

        if (postHash !== preHash) {
          corruptedFiles.push(file);
          filesFailed++;
          errors.push(`CORRUPTION: ${file} — audio stream changed. preHash=${preHash} postHash=${postHash}`);
          console.error(`   🚨 CORRUPTION DETECTED: ${file}`);
          console.error(`      preHash  = ${preHash}`);
          console.error(`      postHash = ${postHash}`);
          aborted = true;
          break;
        }

        filesUpdated++;
        console.log(`   ✅ ${file}`);
      } catch (error) {
        filesFailed++;
        errors.push(`${file}: ${error.message}`);
        console.error(`   ❌ ${file} - ${error.message}`);
      }
    }

    const overallSuccess = filesUpdated > 0 && filesFailed === 0 && corruptedFiles.length === 0;

    console.log(`\n   Summary: ${filesUpdated} updated, ${filesFailed} failed${filesRepaired > 0 ? `, ${filesRepaired} repaired` : ""}${corruptedFiles.length > 0 ? `, ${corruptedFiles.length} CORRUPTED` : ""}`);

    return {
      success: overallSuccess,
      filesProcessed: audioFiles.length,
      filesUpdated,
      filesFailed,
      filesRepaired,
      corruptedFiles,
      aborted,
      errors: errors.length > 0 ? errors : undefined,
      message: corruptedFiles.length > 0
        ? `CORRUPTION DETECTED in ${corruptedFiles.length} file(s); album sync aborted`
        : overallSuccess
          ? `Successfully updated ${filesUpdated} files${filesRepaired > 0 ? ` (${filesRepaired} with malformed tags repaired)` : ""}`
          : filesFailed === audioFiles.length
            ? "Failed to update any files"
            : `Partially successful: ${filesUpdated} updated, ${filesFailed} failed`,
    };
  } catch (error) {
    console.error(`Error writing Plex metadata to files:`, error);
    return {
      success: false,
      error: error.message,
      filesProcessed: 0,
      filesUpdated: 0,
      filesFailed: 0,
      filesRepaired: 0,
    };
  }
}
