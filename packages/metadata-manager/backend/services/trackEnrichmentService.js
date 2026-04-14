import { parseFile } from "music-metadata";
import { basename, extname, resolve as resolvePath } from "path";
import { stat } from "fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, rename, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { writeGenres } from "./genreWriter.js";

const execFileAsync = promisify(execFile);

// Resolve the beets venv python + lastgenre helper script once. The script
// reads beets config from ~/.config/beets and talks to last.fm directly.
const __dirname = dirname(fileURLToPath(import.meta.url));
const BEETS_VENV_PY = resolvePath(
  __dirname,
  "..",
  "..",
  "beets",
  ".venv",
  "bin",
  "python",
);
const LASTGENRE_SCRIPT = resolvePath(
  __dirname,
  "..",
  "scripts",
  "lastgenre_suggest.py",
);

/**
 * Fetch last.fm genre suggestions for a batch of file paths via the
 * lastgenre_suggest.py helper. Returns a Map<filePath, string[]>.
 * Returns an empty map if the venv/script is missing or the call fails —
 * last.fm enrichment is best-effort and must never abort the pipeline.
 */
async function fetchLastgenreSuggestions(filePaths) {
  if (filePaths.length === 0) return new Map();
  if (!existsSync(BEETS_VENV_PY) || !existsSync(LASTGENRE_SCRIPT)) {
    return new Map();
  }
  try {
    const { stdout } = await execFileAsync(
      BEETS_VENV_PY,
      [LASTGENRE_SCRIPT, ...filePaths],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim() || "{}");
    const map = new Map();
    for (const [fp, genres] of Object.entries(parsed)) {
      if (Array.isArray(genres) && genres.length > 0) map.set(fp, genres);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── In-memory enrichment cache ──────────────────────────────────────────
// Key: "filePath:mtimeMs"  |  Value: enrichment result object
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX = 500;
const cache = new Map();

function cacheKey(filePath, mtimeMs) {
  return `${filePath}:${mtimeMs}`;
}

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) cache.delete(key);
  }
  // Hard cap: evict oldest if over limit
  if (cache.size > CACHE_MAX) {
    const entries = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, cache.size - CACHE_MAX);
    for (const [key] of toRemove) cache.delete(key);
  }
}

// ── Metadata reading ────────────────────────────────────────────────────

async function readFileMetadata(filePath) {
  const metadata = await parseFile(filePath);
  const fileStat = await stat(filePath);
  const common = metadata.common;
  const format = metadata.format;

  return {
    artist: common.artist || null,
    title: common.title || null,
    album: common.album || null,
    label: common.label || null,
    year: common.year || null,
    genres: common.genre || [],
    bpm: common.bpm || null,
    initialKey: common.key || null,
    comment: common.comment?.[0]?.text || null,
    filename: basename(filePath),
    format: format.container || extname(filePath).replace(".", "").toUpperCase(),
    duration: format.duration ? formatDuration(format.duration) : null,
    mtimeMs: fileStat.mtimeMs,
  };
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ── Claude API ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a DJ music metadata expert. Given a track's current metadata tags and filename, return enriched/corrected metadata. Your knowledge spans electronic music, hip-hop, house, techno, drum and bass, disco, funk, and all DJ-oriented genres.

Rules:
- If you recognize the track, use your knowledge to fill in missing fields
- If you are not confident about a track, use web search to look it up before answering
- Correct obvious misspellings in artist/title (e.g., "Deadmau5" not "Deadmouse")
- Remove label names or catalog numbers that got concatenated into the title field
- Split "Artist - Title" patterns that ended up in a single field
- Assign 1-3 specific genre names. Be specific: "Deep House" not "House", "Liquid Drum and Bass" not "Drum and Bass"
- For BPM and key, only include if you are confident from your knowledge of the track. Never guess.
- proposedFilename should follow the format: "Artist - Title.ext" using the corrected artist and title
- Return ONLY a valid JSON array, no markdown fencing or code blocks

For each track, return a JSON object with these fields:
{
  "artist": corrected artist name (string),
  "title": corrected track title (string),
  "label": record label if known (string or null),
  "year": release year if known (integer or null),
  "genres": array of 1-3 genre strings,
  "bpm": BPM if confidently known (integer or null),
  "initialKey": musical key if known, e.g. "Am", "C major" (string or null),
  "proposedFilename": suggested filename using corrected metadata (string),
  "confidence": "high", "medium", or "low"
}`;

function buildUserPrompt(tracks) {
  const trackBlocks = tracks.map((t, i) => {
    const lines = [`--- Track ${i + 1} ---`];
    lines.push(`Filename: ${t.filename}`);
    if (t.artist) lines.push(`Artist: ${t.artist}`);
    if (t.title) lines.push(`Title: ${t.title}`);
    if (t.album) lines.push(`Album: ${t.album}`);
    if (t.label) lines.push(`Label: ${t.label}`);
    if (t.year) lines.push(`Year: ${t.year}`);
    if (t.genres?.length) lines.push(`Genre: ${t.genres.join(", ")}`);
    if (t.format) lines.push(`Format: ${t.format}`);
    if (t.duration) lines.push(`Duration: ${t.duration}`);
    if (t.bpm) lines.push(`BPM: ${t.bpm}`);
    if (t.initialKey) lines.push(`Key: ${t.initialKey}`);
    return lines.join("\n");
  });

  return `Enrich these tracks:\n\n${trackBlocks.join("\n\n")}`;
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  return new Anthropic();
}

async function callClaude(tracks) {
  const client = getClient();
  const userMessage = { role: "user", content: buildUserPrompt(tracks) };
  const messages = [userMessage];

  let response;
  let loopCount = 0;
  while (true) {
    loopCount += 1;
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools: [{ type: "web_search_20260209", name: "web_search" }],
    });

    console.log(`[enrichment] API call ${loopCount}, stop_reason=${response.stop_reason}, content blocks=${response.content.length}`);

    if (response.stop_reason === "end_turn") break;

    // Server executed a tool (web search) — append assistant turn and continue
    messages.push({ role: "assistant", content: response.content });
  }

  // Extract text from content blocks (may be interleaved with server_tool blocks)
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  console.log(`[enrichment] Extracted text length=${text.length}, first 200 chars: ${text.slice(0, 200)}`);

  // Strip markdown fencing if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
  return JSON.parse(cleaned);
}

// ── Public API ──────────────────────────────────────────────────────────

const BATCH_SIZE = 8;

/**
 * Enrich metadata for a list of file paths using Claude.
 * Returns { results: [{ filePath, status, current, proposed, confidence }] }
 */
export async function enrichTracks(filePaths) {
  evictExpired();

  const results = [];
  const toEnrich = [];

  // Check cache first
  for (const filePath of filePaths) {
    try {
      const fileStat = await stat(filePath);
      const key = cacheKey(filePath, fileStat.mtimeMs);
      const cached = cache.get(key);
      if (cached) {
        results.push({ ...cached.result, status: "cached" });
        continue;
      }
      toEnrich.push(filePath);
    } catch {
      results.push({ filePath, status: "error", error: "File not found" });
    }
  }

  // Kick off last.fm genre fetching in parallel with Claude. The helper
  // script talks to last.fm per-track and can easily take 5-15s total for
  // a normal batch, so we start it before entering the Claude loop and
  // await it lazily when we're ready to build each entry.
  const lastgenrePromise = fetchLastgenreSuggestions(toEnrich);
  let lastgenreMap = null;

  // Process uncached files in batches
  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);

    // Read metadata for the batch
    const metadataMap = new Map();
    for (const filePath of batch) {
      try {
        const meta = await readFileMetadata(filePath);
        metadataMap.set(filePath, meta);
      } catch (err) {
        results.push({ filePath, status: "error", error: `Failed to read metadata: ${err.message}` });
      }
    }

    const tracksWithData = batch.filter((fp) => metadataMap.has(fp));
    if (tracksWithData.length === 0) continue;

    // Call Claude
    try {
      const claudeInput = tracksWithData.map((fp) => metadataMap.get(fp));
      const claudeResults = await callClaude(claudeInput);

      // Resolve the lastgenre results once — cheap after the first await.
      if (lastgenreMap === null) lastgenreMap = await lastgenrePromise;

      // Claude should return one result per input track
      for (let j = 0; j < tracksWithData.length; j++) {
        const filePath = tracksWithData[j];
        const meta = metadataMap.get(filePath);
        const proposed = claudeResults[j];

        if (!proposed) {
          results.push({ filePath, status: "error", error: "No result from Claude" });
          continue;
        }

        const current = {
          artist: meta.artist,
          title: meta.title,
          album: meta.album,
          label: meta.label,
          year: meta.year,
          genres: meta.genres,
          bpm: meta.bpm,
          initialKey: meta.initialKey,
        };

        const entry = {
          filePath,
          status: "success",
          current,
          proposed: {
            artist: proposed.artist || null,
            title: proposed.title || null,
            label: proposed.label || null,
            year: proposed.year || null,
            genres: proposed.genres || [],
            lastgenreGenres: lastgenreMap.get(filePath) || [],
            bpm: proposed.bpm || null,
            initialKey: proposed.initialKey || null,
            proposedFilename: proposed.proposedFilename || null,
          },
          confidence: proposed.confidence || "low",
        };

        results.push(entry);

        // Cache the result
        const key = cacheKey(filePath, meta.mtimeMs);
        cache.set(key, { result: entry, cachedAt: Date.now() });
      }
    } catch (err) {
      // Claude API failure — mark all tracks in batch as errors
      for (const filePath of tracksWithData) {
        results.push({ filePath, status: "error", error: `Claude API error: ${err.message}` });
      }
    }
  }

  return { results };
}

/**
 * Get cached enrichment results (no Claude call).
 */
export async function getCachedEnrichments(filePaths) {
  evictExpired();
  const results = [];

  for (const filePath of filePaths) {
    try {
      const fileStat = await stat(filePath);
      const key = cacheKey(filePath, fileStat.mtimeMs);
      const cached = cache.get(key);
      if (cached) {
        results.push({ ...cached.result, status: "cached" });
      }
    } catch {
      // File not found or stat error — skip silently
    }
  }

  return { results };
}

/**
 * Apply proposed metadata fields to a file using ffmpeg.
 * Only writes the fields specified in `fields`.
 * Uses ffmpeg -c copy to avoid re-encoding.
 */
export async function applyEnrichment(filePath, fields) {
  // Validate the file exists
  const fileStat = await stat(filePath);
  if (!fileStat) throw new Error("File not found");

  const ext = extname(filePath).toLowerCase();
  const isFlac = ext === ".flac";

  // ffmpeg handles the scalar fields. Genre is written separately via
  // writeGenres() because it needs real per-format multi-value encoding
  // (v2.4 TCON null-separated / multiple Vorbis GENRE comments) which
  // ffmpeg cannot produce.
  const metaArgs = [];
  const fieldToTag = {
    artist: isFlac ? "ARTIST" : "artist",
    title: isFlac ? "TITLE" : "title",
    album: isFlac ? "ALBUM" : "album",
    year: isFlac ? "DATE" : "date",
  };

  const fieldsWritten = [];

  for (const [field, tag] of Object.entries(fieldToTag)) {
    if (fields[field] != null && fields[field] !== "") {
      metaArgs.push("-metadata", `${tag}=${String(fields[field])}`);
      fieldsWritten.push(field);
    }
  }

  const hasGenres = Array.isArray(fields.genre) && fields.genre.length > 0;

  if (metaArgs.length === 0 && !hasGenres) {
    return { ok: true, filePath, fieldsWritten: [] };
  }

  if (metaArgs.length > 0) {
    const tmpFile = join(dirname(filePath), `.enrichment_tmp_${Date.now()}${ext}`);
    const ffmpegArgs = [
      "-i", filePath,
      "-c", "copy",
      ...metaArgs,
      "-y",
      tmpFile,
    ];

    try {
      await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 30000 });
      await rename(tmpFile, filePath);
    } catch (err) {
      await unlink(tmpFile).catch(() => {});
      throw new Error(`ffmpeg failed: ${err.message}`);
    }
  }

  if (hasGenres) {
    await writeGenres(filePath, fields.genre);
    fieldsWritten.push("genre");
  }

  const key = cacheKey(filePath, fileStat.mtimeMs);
  cache.delete(key);

  return { ok: true, filePath, fieldsWritten };
}
