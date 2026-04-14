import fs from "fs/promises";
import os from "os";
import path from "path";
import NodeID3 from "node-id3";
import { exec } from "child_process";
import { promisify } from "util";
import { captureTimestamps, restoreTimestamps } from "../timestamps.js";

const execAsync = promisify(exec);

// Simple MIME guard: allow only JPEG/PNG
function isSupportedMime(mime) {
  if (!mime) return true; // allow if unknown; we'll still try to embed
  const m = mime.toLowerCase();
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png";
}

export async function fetchImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`Image download failed: ${resp.status} ${resp.statusText}`);
    const mime = resp.headers.get("content-type") || undefined;
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return { buffer, mime, size: buffer.length };
  } finally {
    clearTimeout(timeout);
  }
}

function getExtForMime(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  return ".jpg";
}

function detectFormatByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "mp3";
  if (ext === ".flac") return "flac";
  return "other";
}

async function writeArtworkMP3(filePath, imageBuffer, mime) {
  // Replace artwork with a single APIC (type 3 front cover)
  const tags = {
    image: {
      mime: mime || "image/jpeg",
      type: {
        id: 3,
        name: "front cover",
      },
      description: "Front cover",
      imageBuffer,
    },
  };
  const ok = NodeID3.update(tags, filePath);
  if (!ok) throw new Error("Failed to embed artwork in MP3");
}

async function writeArtworkFLAC(filePath, imageBuffer, mime) {
  // Capture timestamps before writing (metaflac artwork embedding rewrites
  // the file via temp+rename, which changes birthtime on APFS)
  const originalTimestamps = await captureTimestamps(filePath);

  // Write image to a temp file first
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "artwork-"));
  const imgPath = path.join(tmpDir, `cover${getExtForMime(mime)}`);
  await fs.writeFile(imgPath, imageBuffer);
  const quoted = `"${filePath}"`;
  try {
    // Remove all existing picture blocks
    await execAsync(`metaflac --remove --block-type=PICTURE ${quoted}`);
  } catch {}
  // Import new picture (full resolution, no resize)
  await execAsync(`metaflac --import-picture-from="${imgPath}" ${quoted}`);
  // Cleanup
  try {
    await fs.unlink(imgPath);
  } catch {}
  try {
    await fs.rmdir(tmpDir);
  } catch {}

  // Restore original timestamps (preserves birthtime/date created)
  await restoreTimestamps(filePath, originalTimestamps);
}

export async function embedArtworkToFile(filePath, image) {
  if (!image || !image.buffer) throw new Error("No image provided");
  if (!isSupportedMime(image.mime)) throw new Error(`Unsupported image type: ${image.mime}`);
  const format = detectFormatByExt(filePath);
  if (format === "mp3") {
    await writeArtworkMP3(filePath, image.buffer, image.mime);
    return { filePath, format: "mp3", success: true };
  }
  if (format === "flac") {
    await writeArtworkFLAC(filePath, image.buffer, image.mime);
    return { filePath, format: "flac", success: true };
  }
  return { filePath, format: "other", success: false, error: "Unsupported format" };
}

export async function embedArtworkToAlbum(tracks, image) {
  const results = [];
  for (const t of tracks) {
    try {
      const r = await embedArtworkToFile(t.filePath, image);
      results.push({ trackId: t.id, ...r });
    } catch (e) {
      results.push({ trackId: t.id, filePath: t.filePath, success: false, error: e.message });
    }
  }
  const embedded = results.filter(r => r.success).length;
  const failed = results.length - embedded;
  return { results, summary: { total: results.length, embedded, failed } };
}
