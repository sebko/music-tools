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
import { logLastfm, logClaude } from "./scanResultLog.js";

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
- If you are not certain about a track OR the artist sits in an underground / regional scene you don't have strong knowledge of (e.g. plugg, rage, cumbia rebajada, niche dub, drill subscenes), call web_search before answering. Prefer rateyourmusic.com and discogs.com for genre tags.
- Correct obvious misspellings in artist/title (e.g., "Deadmau5" not "Deadmouse")
- Remove label names or catalog numbers that got concatenated into the title field
- Split "Artist - Title" patterns that ended up in a single field
- Assign 1-3 specific genre names. Be specific: prefer "Deep House" over "House", "Liquid Drum and Bass" over "Drum and Bass", "Cloud Rap" over "Rap", "Plugg" over "Hip Hop", "Cumbia Rebajada" over "Cumbia", "Dub Techno" over "Techno". When a track sits in a recognised subgenre scene (rage, plugg, cloud rap, jersey club, footwork, dub, dub techno, dancehall, cumbia rebajada, jungle, halftime, drill, hyperpop, ambient dub, etc.), use the subgenre name — never the umbrella term.
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

function buildUserPrompt(tracks, opts = {}) {
  const trackBlocks = tracks.map((t, i) => {
    const lines = [`--- Track ${i + 1} ---`];
    lines.push(`Filename: ${t.filename}`);
    if (t.artist) lines.push(`Artist: ${t.artist}`);
    if (t.title) lines.push(`Title: ${t.title}`);
    // Intentionally omit Album, Label, and Genre. In this library:
    // - Album is always the chronological singles folder (e.g.
    //   "Singles - 2026-04 April"), which misleads Claude into searching
    //   for an album that doesn't exist.
    // - Label and Genre are commonly legacy/garbage values from prior
    //   tagging passes and bias the response. The scan exists to propose
    //   new ones, not to confirm old ones.
    if (t.year) lines.push(`Year: ${t.year}`);
    if (t.format) lines.push(`Format: ${t.format}`);
    if (t.duration) lines.push(`Duration: ${t.duration}`);
    if (t.bpm) lines.push(`BPM: ${t.bpm}`);
    if (t.initialKey) lines.push(`Key: ${t.initialKey}`);
    return lines.join("\n");
  });

  const preamble = opts.forceSearch
    ? "You returned low confidence on a previous pass for these tracks. Call web_search on rateyourmusic.com or discogs.com for each one before answering this time, and prefer the most specific subgenre listed there.\n\n"
    : "";

  return `${preamble}Enrich these tracks:\n\n${trackBlocks.join("\n\n")}`;
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  return new Anthropic();
}

// Domains the Sonnet web search is allowed to consult. Curated for
// genre-rich, taxonomy-friendly sources so obscure subgenres (plugg, rage,
// cumbia rebajada, dub variants) come back as the specific tag rather than
// the umbrella term. Subdomains match automatically — no protocol, no wildcard.
const WEB_SEARCH_ALLOWED_DOMAINS = [
  "rateyourmusic.com",
  "discogs.com",
  "bandcamp.com",
  "boomkat.com",
  "ra.co",
  "genius.com",
  "pitchfork.com",
  "en.wikipedia.org",
];

async function callClaude(tracks, opts = {}) {
  const client = getClient();
  const userMessage = { role: "user", content: buildUserPrompt(tracks, opts) };
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
      tools: [{
        type: "web_search_20260209",
        name: "web_search",
        allowed_domains: WEB_SEARCH_ALLOWED_DOMAINS,
        max_uses: 5,
      }],
    });

    console.log(`[enrichment] API call ${loopCount}, stop_reason=${response.stop_reason}, content blocks=${response.content.length}${opts.forceSearch ? " (forced-search retry)" : ""}`);

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

  // Claude sometimes prefixes the JSON with prose ("Based on the search
  // results, here's the data:") or wraps it in ```json fences. Grab the
  // outermost bracketed array/object rather than trusting the whole string.
  const cleaned = extractJson(text);
  return JSON.parse(cleaned);
}

// Re-runs only the low-confidence tracks with a forced-search prompt and
// merges the retried results back over the originals by filename. Latency
// cost is paid only on weak tracks; high-confidence tracks pass through.
async function callClaudeWithRetry(tracks) {
  const initial = await callClaude(tracks);

  const lowIndices = initial
    .map((r, i) => (r?.confidence === "low" ? i : -1))
    .filter((i) => i >= 0);

  if (lowIndices.length === 0) return initial;

  const lowTracks = lowIndices.map((i) => tracks[i]);
  const retried = await callClaude(lowTracks, { forceSearch: true });

  const byFilename = new Map();
  retried.forEach((r, i) => byFilename.set(lowTracks[i].filename, r));

  return initial.map((r, i) => {
    const replacement = byFilename.get(tracks[i].filename);
    return replacement ?? r;
  });
}

function extractJson(text) {
  const trimmed = text.trim();

  // Prefer fenced code blocks (```json ... ``` or ``` ... ```) — when
  // present these are unambiguous.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Otherwise scan for every top-level balanced bracket/brace span. Claude's
  // prose sometimes contains incidental brackets like `[PROD. BY 4LIENS]`
  // which the old "first [ to last ]" heuristic would gleefully concatenate
  // with the real JSON further down. Track string state so brackets inside
  // string literals don't shift depth.
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[" || ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]" || ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          spans.push(trimmed.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  if (spans.length === 0) {
    throw new Error(`No JSON found in Claude response: ${trimmed.slice(0, 200)}`);
  }

  // Pick the longest span that parses. The real Claude payload is almost
  // always the largest bracket block; the parse check ensures incidental
  // prose-brackets don't slip through if they happen to be longer.
  spans.sort((a, b) => b.length - a.length);
  for (const span of spans) {
    try {
      JSON.parse(span);
      return span;
    } catch {
      // try next candidate
    }
  }
  // None parsed — return the longest so the upstream JSON.parse throws with
  // a concrete error message.
  return spans[0];
}

// ── Public API ──────────────────────────────────────────────────────────

function buildCurrent(meta) {
  return {
    artist: meta.artist,
    title: meta.title,
    album: meta.album,
    label: meta.label,
    year: meta.year,
    genres: meta.genres,
    bpm: meta.bpm,
    initialKey: meta.initialKey,
  };
}

function emptyProposed(lastgenreGenres) {
  return {
    artist: null,
    title: null,
    label: null,
    year: null,
    genres: [],
    lastgenreGenres: lastgenreGenres || [],
    bpm: null,
    initialKey: null,
    proposedFilename: null,
  };
}

function proposedFromClaude(claudeResult, lastgenreGenres) {
  return {
    artist: claudeResult.artist || null,
    title: claudeResult.title || null,
    label: claudeResult.label || null,
    year: claudeResult.year || null,
    genres: claudeResult.genres || [],
    lastgenreGenres: lastgenreGenres || [],
    bpm: claudeResult.bpm || null,
    initialKey: claudeResult.initialKey || null,
    proposedFilename: claudeResult.proposedFilename || null,
  };
}

/**
 * Prepare enrichment entries for a list of file paths.
 * Reads metadata + last.fm genre suggestions only — Claude is NOT called here.
 * Returns { results: [{ filePath, status, current, proposed, confidence }] }
 * where proposed carries only `lastgenreGenres` until the user triggers an AI
 * scan via enrichSingleTrackWithClaude.
 */
export async function enrichTracks(filePaths) {
  evictExpired();

  const results = [];
  const toEnrich = [];

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

  const lastgenrePromise = fetchLastgenreSuggestions(toEnrich);

  const metadataMap = new Map();
  for (const filePath of toEnrich) {
    try {
      metadataMap.set(filePath, await readFileMetadata(filePath));
    } catch (err) {
      results.push({
        filePath,
        status: "error",
        error: `Failed to read metadata: ${err.message}`,
      });
    }
  }

  const lastgenreMap = await lastgenrePromise;

  for (const filePath of toEnrich) {
    const meta = metadataMap.get(filePath);
    if (!meta) continue;
    const lastgenreGenres = lastgenreMap.get(filePath);
    const entry = {
      filePath,
      status: "success",
      current: buildCurrent(meta),
      proposed: emptyProposed(lastgenreGenres),
      confidence: "low",
    };
    results.push(entry);
    cache.set(cacheKey(filePath, meta.mtimeMs), {
      result: entry,
      cachedAt: Date.now(),
    });
    void logLastfm(filePath, meta.mtimeMs, lastgenreGenres);
  }

  return { results };
}

/**
 * Run Claude against a single file and return a `proposed`-shaped object.
 * Merges Claude's scalar suggestions with any existing last.fm genres so the
 * returned object is ready to drop into the existing enrichment UI.
 * Also updates the in-memory cache so repeat clicks are no-ops.
 */
export async function enrichSingleTrackWithClaude(filePath) {
  const meta = await readFileMetadata(filePath);
  const claudeResults = await callClaudeWithRetry([meta]);
  const claudeResult = claudeResults?.[0];
  if (!claudeResult) {
    throw new Error("No result from Claude");
  }

  const key = cacheKey(filePath, meta.mtimeMs);
  const cached = cache.get(key)?.result;
  const lastgenreGenres = cached?.proposed?.lastgenreGenres || [];
  const proposed = proposedFromClaude(claudeResult, lastgenreGenres);

  const entry = {
    filePath,
    status: "success",
    current: cached?.current || buildCurrent(meta),
    proposed,
    confidence: claudeResult.confidence || "low",
  };
  cache.set(key, { result: entry, cachedAt: Date.now() });
  void logClaude(filePath, meta.mtimeMs, proposed, entry.confidence);

  return { proposed, confidence: entry.confidence };
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
