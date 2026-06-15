import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Hash of a file's audio stream only — tag/header bytes are excluded.
 *
 * FLAC: reads the STREAMINFO PCM-MD5 stored in the header. metaflac
 * never changes this value during tag edits — a mismatch before/after
 * means the audio stream itself was touched.
 *
 * MP3 / M4A: demuxes the audio stream with `ffmpeg -c copy` (no
 * decode) and hashes the packet bytes. ID3v2 frames and MP4 tag
 * atoms sit outside the audio packet stream, so normal tag edits
 * don't move the hash.
 *
 * @param {string} filePath
 * @param {"flac"|"mp3"|"m4a"} format
 * @returns {Promise<string>} hex digest
 */
export async function computeAudioStreamHash(filePath, format) {
  if (format === "flac") {
    const { stdout } = await execFileAsync("metaflac", ["--show-md5sum", filePath]);
    return stdout.trim();
  }

  const { stdout } = await execFileAsync("ffmpeg", [
    "-v", "error",
    "-i", filePath,
    "-map", "0:a",
    "-c", "copy",
    "-f", "md5",
    "-",
  ]);
  return stdout.trim().replace(/^MD5=/, "");
}
