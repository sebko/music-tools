import { appendFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(__dirname, "..", "data", "genre-scans.jsonl");

let dirEnsured = false;

async function append(line) {
  try {
    if (!dirEnsured) {
      await mkdir(dirname(LOG_PATH), { recursive: true });
      dirEnsured = true;
    }
    await appendFile(LOG_PATH, line + "\n");
  } catch (err) {
    console.warn(`scanResultLog: failed to append (${err.message})`);
  }
}

export async function logLastfm(filePath, mtimeMs, genres) {
  if (!Array.isArray(genres) || genres.length === 0) return;
  await append(
    JSON.stringify({
      type: "lastfm",
      filePath,
      mtimeMs,
      genres,
      at: new Date().toISOString(),
    }),
  );
}

export async function logClaude(filePath, mtimeMs, proposed, confidence) {
  await append(
    JSON.stringify({
      type: "claude",
      filePath,
      mtimeMs,
      proposed,
      confidence,
      at: new Date().toISOString(),
    }),
  );
}
