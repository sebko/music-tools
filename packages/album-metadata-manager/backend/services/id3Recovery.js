/**
 * Permissive ID3 tag recovery via ffmpeg.
 *
 * Used when node-id3tag's strict frame walker throws (malformed
 * frame-size fields from Serato-style taggers). ffmpeg reads what
 * it can and skips garbage without throwing — good enough to
 * preserve track title/artist/number/etc. across a tag rewrite.
 *
 * Audio is not touched by anything here. Callers are expected to
 * hand the recovered tag object to NodeID3.write(), which strips
 * the old tag positionally (via the outer 10-byte ID3v2 header)
 * and prepends a fresh one — audio byte offset is preserved.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FFMETADATA_TO_ID3 = {
  title: "title",
  artist: "artist",
  album: "album",
  album_artist: "performerInfo",
  track: "trackNumber",
  disc: "partOfSet",
  date: "year",
  TYER: "year",
  genre: "genre",
  composer: "composer",
};

function parseFfmetadata(text) {
  const tags = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith(";") || line.startsWith("[")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!value) continue;
    const mapped = FFMETADATA_TO_ID3[key];
    if (mapped) {
      tags[mapped] = value;
    } else if (key.toLowerCase() === "comment") {
      tags.comment = { language: "eng", text: value };
    }
  }
  return tags;
}

function detectImageMime(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

async function extractEmbeddedArt(filePath) {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-v", "error",
        "-i", filePath,
        "-map", "0:v",
        "-c", "copy",
        "-f", "image2pipe",
        "-",
      ],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
    if (!stdout || stdout.length === 0) return null;
    const mime = detectImageMime(stdout);
    if (!mime) return null;
    return {
      mime,
      type: { id: 3, name: "front cover" },
      description: "",
      imageBuffer: stdout,
    };
  } catch {
    return null;
  }
}

/**
 * Recover ID3 tags from an MP3 file whose tag region is too
 * malformed for strict parsers.
 *
 * @param {string} filePath
 * @returns {Promise<{ tags: object, recoveredKeys: string[], hasArt: boolean }>}
 */
export async function recoverMP3Tags(filePath) {
  const tags = {};

  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-v", "error",
      "-i", filePath,
      "-f", "ffmetadata",
      "-",
    ]);
    Object.assign(tags, parseFfmetadata(stdout));
  } catch {
    // ffmpeg couldn't read tags at all — caller still gets an
    // empty object and can proceed with Plex-only metadata.
  }

  const art = await extractEmbeddedArt(filePath);
  if (art) {
    tags.image = art;
  }

  return {
    tags,
    recoveredKeys: Object.keys(tags).filter((k) => k !== "image"),
    hasArt: !!art,
  };
}
