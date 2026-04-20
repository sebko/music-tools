import { spawnSync } from "child_process";
import { dirname, join, basename, extname, resolve as resolvePath } from "path";
import { existsSync, renameSync, mkdirSync, copyFileSync, unlinkSync } from "fs";
import Database from "better-sqlite3";
import { getBeetsLibraryDbPath } from "./beetsConfig.js";
import { runBeet, runBeetStreaming } from "./beetsRunner.js";
import { enrichTracks as claudeEnrichTracks } from "./trackEnrichmentService.js";
import { runProcessingPhases } from "./libraryProcessingPipeline.js";
import { findLibraryMatches } from "./duplicateMatcher.js";
import {
  SINGLES_VENV_PY,
  TAG_SCRIPT,
  spawnStream,
  parsePythonProgressLine,
  parseImportProgressLine,
  stripAnsi,
  createOpHelpers,
} from "./beetsPipelineHelpers.js";

/**
 * Run every pipeline phase after Claude enrichment approval. Called either
 * inline (when enrichment is skipped/failed) or from `resumeInboxImport`
 * after the user approves the enrichment diff in the UI.
 *
 * This is where `beet import` happens — deferred from the pre-review path
 * so that abandoning the review window leaves NOTHING in the beets library.
 * Files on disk still sit in their correct month folder (already tagged +
 * art-embedded by the pre-review phases) so a subsequent import run is a
 * clean no-op over the now-empty inbox.
 */
async function runPostEnrichmentPhases(operationsMap, opId) {
  const op = operationsMap.get(opId);
  if (!op) throw new Error("Operation not found");
  const { monthPath, libraryPath, movedCount } = op;
  if (!monthPath || !libraryPath) {
    throw new Error("Operation is missing monthPath/libraryPath — cannot resume");
  }

  const { patch, appendOutput } = createOpHelpers(operationsMap, opId);

  // ---------- beet import -s -A monthPath ----------
  const existingPaths = readImportedPaths();

  patch({ phase: "importing", processed: 0, total: movedCount || 0, currentFile: null });
  let importProcessed = 0;
  const importResult = await runBeetStreaming(
    ["import", "-s", "-A", monthPath],
    (chunk) => {
      appendOutput(chunk);
      for (const line of chunk.split("\n")) {
        const fn = parseImportProgressLine(line);
        if (fn) {
          importProcessed += 1;
          patch({
            processed: Math.min(importProcessed, movedCount || importProcessed),
            currentFile: fn,
          });
        }
      }
    },
  );
  if (importResult.code !== 0) {
    throw new Error(
      `beet import failed (exit ${importResult.code}): ${importResult.stderr || "(no stderr)"}`,
    );
  }
  patch({ currentFile: null });

  const newPaths = [...readImportedPaths()].filter((p) => !existingPaths.has(p));
  const monthFolders = uniqueMonthFolders(newPaths, libraryPath);

  if (monthFolders.length === 0) {
    patch({ phase: "updating", processed: 0, total: 0, currentFile: null });
    await runBeetStreaming(["update"], (chunk) => appendOutput(chunk));
    patch({
      status: "completed",
      phase: "done",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  // Run the shared processing pipeline (bad → scrub → genres → art → replaygain …)
  await runProcessingPhases({ monthFolders, patch, appendOutput });

  patch({
    status: "completed",
    phase: "done",
    completedAt: new Date().toISOString(),
  });
}

/**
 * Resume an inbox import that paused at the Claude enrichment review step.
 * Called by POST /api/inbox/import/:id/resume after the user has (optionally)
 * applied enrichment fields to files via the existing per-track apply route.
 */
export function resumeInboxImport(operationsMap, opId) {
  const op = operationsMap.get(opId);
  if (!op) throw new Error("Operation not found");
  if (op.status !== "awaiting_review") {
    throw new Error(`Operation is not awaiting review (status=${op.status})`);
  }
  if (!op.monthPath) {
    throw new Error("Operation is missing monthPath — cannot resume");
  }

  operationsMap.set(opId, { ...op, status: "running" });

  (async () => {
    try {
      await runPostEnrichmentPhases(operationsMap, opId);
    } catch (err) {
      const current = operationsMap.get(opId) || {};
      operationsMap.set(opId, {
        ...current,
        status: "failed",
        error: err.message,
        completedAt: new Date().toISOString(),
      });
    }
  })();
}

function requireBinary(name, installHint) {
  const probe = spawnSync("/usr/bin/env", ["which", name], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout.trim()) {
    throw new Error(`${name} not found on PATH. ${installHint}`);
  }
}

function readImportedPaths() {
  const dbPath = getBeetsLibraryDbPath();
  if (!existsSync(dbPath)) return new Set();
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT CAST(path AS TEXT) as path FROM items").all();
    return new Set(rows.map((r) => resolvePath(r.path)));
  } finally {
    db.close();
  }
}

function uniqueMonthFolders(paths, libraryRoot) {
  const libRoot = resolvePath(libraryRoot);
  const months = new Set();
  for (const p of paths) {
    if (!p.startsWith(libRoot + "/")) continue;
    const rel = p.slice(libRoot.length + 1);
    const parts = rel.split("/");
    if (parts.length >= 3) months.add(join(parts[0], parts[1]));
  }
  return [...months].map((m) => join(libRoot, m));
}

const LOSSY_TO_MP3 = new Set([".ogg", ".opus", ".aac", ".m4a", ".wma"]);
const LOSSLESS_TO_FLAC = new Set([".wav", ".aiff", ".aif"]);

function classifyForConversion(ext) {
  const e = ext.toLowerCase();
  if (LOSSY_TO_MP3.has(e)) return "mp3";
  if (LOSSLESS_TO_FLAC.has(e)) return "flac";
  return null;
}

function readInboxFileInfo(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration,bit_rate:format_tags=artist,title,album",
      "-of", "default=noprint_wrappers=1:nokey=0",
      file,
    ],
    { encoding: "utf8" },
  );
  const info = {
    artist: "",
    title: "",
    album: "",
    bitrate: 0,
    length: 0,
    format: extname(file).slice(1).toLowerCase(),
  };
  if (result.status !== 0) return info;
  for (const line of result.stdout.split("\n")) {
    const tagMatch = line.match(/^TAG:(\w+)=(.*)$/i);
    if (tagMatch) {
      const key = tagMatch[1].toLowerCase();
      if (key in info) info[key] = tagMatch[2].trim();
      continue;
    }
    const fieldMatch = line.match(/^(\w+)=(.*)$/);
    if (fieldMatch) {
      const key = fieldMatch[1].toLowerCase();
      if (key === "bit_rate") info.bitrate = Number(fieldMatch[2]) || 0;
      if (key === "duration") info.length = Number(fieldMatch[2]) || 0;
    }
  }
  return info;
}

function pickUniqueDest(destDir, name) {
  let candidate = join(destDir, name);
  if (!existsSync(candidate)) return candidate;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let n = 2;
  while (existsSync(join(destDir, `${stem} (${n})${ext}`))) n += 1;
  return join(destDir, `${stem} (${n})${ext}`);
}

function ffmpegArgs(src, dest, target) {
  if (target === "mp3") {
    return [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", src,
      "-c:a", "libmp3lame", "-b:a", "320k",
      "-map_metadata", "0", "-id3v2_version", "3",
      dest,
    ];
  }
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", src,
    "-c:a", "flac", "-compression_level", "8",
    "-map_metadata", "0",
    dest,
  ];
}

function currentMonthFolder(libraryPath) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const folderName = `${year}-${String(month + 1).padStart(2, "0")} ${monthName}`;
  const yearPath = join(libraryPath, String(year));
  const monthPath = join(yearPath, folderName);
  return { yearPath, monthPath, folderName };
}

function moveFilesToLibrary(files, libraryPath) {
  const { yearPath, monthPath } = currentMonthFolder(libraryPath);
  mkdirSync(yearPath, { recursive: true });
  mkdirSync(monthPath, { recursive: true });

  const moved = [];
  for (const src of files) {
    const dest = pickUniqueDest(monthPath, basename(src));
    try {
      renameSync(src, dest);
    } catch (err) {
      if (err.code !== "EXDEV") throw err;
      copyFileSync(src, dest);
      unlinkSync(src);
    }
    moved.push(dest);
  }
  return moved;
}

/**
 * Convert → move → tag → enrich. Either pauses at the enrichment review
 * step or chains straight into runPostEnrichmentPhases. Reads the file
 * list and inbox path from operation state so it can be invoked both
 * from the initial run and from resumeInboxImportAfterDuplicateReview.
 */
async function runConversionThroughEnrichment(operationsMap, opId) {
  const op = operationsMap.get(opId);
  if (!op) throw new Error("Operation not found");
  const { libraryPath, inboxPath } = op;
  let workingFiles = [...(op.workingFiles || [])];
  if (workingFiles.length === 0) {
    // Every duplicated file was skipped → nothing to do.
    operationsMap.set(opId, {
      ...op,
      status: "completed",
      phase: "done",
      completedAt: new Date().toISOString(),
    });
    return;
  }
  const { patch, appendOutput } = createOpHelpers(operationsMap, opId);

  const needsConversion = [];
  const passThrough = [];
  for (const f of workingFiles) {
    const target = classifyForConversion(extname(f));
    if (target) needsConversion.push({ src: f, target });
    else passThrough.push(f);
  }

  const convertedFiles = [];
  if (needsConversion.length > 0) {
    patch({
      phase: "converting",
      processed: 0,
      total: needsConversion.length,
      currentFile: null,
    });

    let converted = 0;
    for (const { src, target } of needsConversion) {
      const srcBase = basename(src);
      patch({ processed: converted, currentFile: srcBase });
      appendOutput(`Converting: ${srcBase} -> .${target}\n`);

      const srcDir = dirname(src);
      const stem = basename(src, extname(src));
      const dest = pickUniqueDest(srcDir, `${stem}.${target}`);

      const result = await spawnStream(
        "ffmpeg",
        ffmpegArgs(src, dest, target),
        (line) => {
          if (line) appendOutput(line);
        },
      );
      if (result.code !== 0) {
        throw new Error(
          `ffmpeg failed for ${srcBase} (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
        );
      }

      unlinkSync(src);
      convertedFiles.push(dest);
      converted += 1;
      patch({ processed: converted });
    }

    patch({ currentFile: null });
  }

  workingFiles = [...passThrough, ...convertedFiles];
  const pendingTotal = workingFiles.length;

  patch({ phase: "importing", processed: 0, total: pendingTotal, currentFile: null });

  const { monthPath } = currentMonthFolder(libraryPath);
  const movedFiles = moveFilesToLibrary(workingFiles, libraryPath);
  for (const f of movedFiles) {
    appendOutput(`Moved: ${basename(f)} -> ${monthPath}\n`);
  }

  if (!existsSync(SINGLES_VENV_PY)) {
    throw new Error(
      `Python venv missing at ${SINGLES_VENV_PY}. ` +
        `Run: cd packages/singles-metadata-manager && ./setup.sh`,
    );
  }

  patch({ monthPath, movedCount: pendingTotal });

  const yearFolder = dirname(monthPath);

  patch({ phase: "tagging", processed: 0, total: pendingTotal, currentFile: null });
  let tagProcessed = 0;
  {
    const result = await spawnStream(
      SINGLES_VENV_PY,
      [TAG_SCRIPT, yearFolder],
      (line) => {
        appendOutput(line);
        const fn = parsePythonProgressLine(line);
        if (fn) {
          tagProcessed += 1;
          patch({
            processed: Math.min(tagProcessed, pendingTotal),
            currentFile: fn,
          });
        }
      },
    );
    if (result.code !== 0) {
      throw new Error(
        `set_album_tags.py failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
      );
    }
  }
  patch({ processed: pendingTotal, currentFile: null });

  let enrichmentResults = [];
  let enrichmentFailed = false;
  try {
    patch({ phase: "enriching", processed: 0, total: movedFiles.length, currentFile: null });
    appendOutput("Enriching metadata via Claude AI...\n");
    const enrichResult = await claudeEnrichTracks(movedFiles);
    enrichmentResults = enrichResult.results || [];
    for (const r of enrichmentResults) {
      if (r.status === "error") {
        appendOutput(`  Skipped ${basename(r.filePath)}: ${r.error}\n`);
      }
    }
    patch({ processed: movedFiles.length, currentFile: null });
  } catch (enrichErr) {
    console.error("[enrichment] Claude enrichment failed:", enrichErr);
    appendOutput(`Enrichment skipped: ${enrichErr.message}\n`);
    enrichmentFailed = true;
  }

  const reviewable = enrichmentResults.filter((r) => r.status !== "error");
  if (!enrichmentFailed && reviewable.length > 0) {
    patch({
      status: "awaiting_review",
      phase: "awaiting-enrichment-review",
      enrichmentResults,
      inboxPath,
      currentFile: null,
    });
    return;
  }

  await runPostEnrichmentPhases(operationsMap, opId);
}

/**
 * Resume an inbox import that paused after the pre-conversion duplicate
 * check. `decisions` is keyed by inbox file path:
 *   { [filePath]: { action: "skip_keep"|"skip_delete"|"replace"|"import_anyway",
 *                   replaceIds?: number[] } }
 * Files with `skip_*` are dropped from workingFiles (and unlinked from
 * inbox if `skip_delete`). For `replace`, the listed library track ids
 * are removed via `beet rm -d -f id:N` before the inbox file proceeds
 * through the regular conversion + import pipeline.
 */
export function resumeInboxImportAfterDuplicateReview(operationsMap, opId, decisions) {
  const op = operationsMap.get(opId);
  if (!op) throw new Error("Operation not found");
  if (op.status !== "awaiting_duplicate_review") {
    throw new Error(`Operation is not awaiting duplicate review (status=${op.status})`);
  }
  if (!Array.isArray(op.workingFiles)) {
    throw new Error("Operation is missing workingFiles — cannot resume");
  }

  const { patch, appendOutput } = createOpHelpers(operationsMap, opId);
  operationsMap.set(opId, { ...op, status: "running" });

  (async () => {
    try {
      const replaceIds = [];
      const filteredFiles = [];
      for (const f of op.workingFiles) {
        const decision = decisions?.[f] || { action: "import_anyway" };
        if (decision.action === "skip_keep") {
          appendOutput(`Skipping (kept in inbox): ${basename(f)}\n`);
          continue;
        }
        if (decision.action === "skip_delete") {
          appendOutput(`Skipping (deleting from inbox): ${basename(f)}\n`);
          try {
            unlinkSync(f);
          } catch (err) {
            appendOutput(`  Warning: failed to delete ${basename(f)}: ${err.message}\n`);
          }
          continue;
        }
        if (decision.action === "replace" && Array.isArray(decision.replaceIds)) {
          for (const id of decision.replaceIds) {
            if (Number.isInteger(id) && id > 0) replaceIds.push(id);
          }
        }
        filteredFiles.push(f);
      }

      if (replaceIds.length > 0) {
        patch({ phase: "removing-duplicates", processed: 0, total: replaceIds.length, currentFile: null });
        appendOutput(`Removing ${replaceIds.length} library track(s) marked for replacement...\n`);
        let removed = 0;
        for (const id of replaceIds) {
          const result = await runBeet(["rm", "-d", "-f", `id:${id}`]);
          if (result.code !== 0) {
            appendOutput(`  beet rm id:${id} failed (exit ${result.code}): ${result.stderr || "(no stderr)"}\n`);
          }
          removed += 1;
          patch({ processed: removed });
        }
        patch({ currentFile: null });
      }

      operationsMap.set(opId, {
        ...operationsMap.get(opId),
        workingFiles: filteredFiles,
        duplicateMatches: null,
      });

      await runConversionThroughEnrichment(operationsMap, opId);
    } catch (err) {
      const current = operationsMap.get(opId) || {};
      operationsMap.set(opId, {
        ...current,
        status: "failed",
        error: err.message,
        completedAt: new Date().toISOString(),
      });
    }
  })();
}

/**
 * Run the full inbox import pipeline under an existing operation id.
 *
 * Phase 1 — pre-conversion checks (this function):
 *   -2.   requireBinary checks (mp3val, ffmpeg, ffprobe)
 *   -1.5. validate inbox tags (reject if artist/title missing)
 *   -1.   per-file beets duplicate lookup → PAUSE for user review (if any)
 *
 * Phase 2 — convert → move → tag → enrich (runConversionThroughEnrichment):
 *    0.   ffmpeg conversion of non-mp3/flac inbox files
 *    1.   move files into the current month folder
 *    2.   set_album_tags.py on the year folder
 *    3.   Claude AI enrichment proposals → PAUSE for user review
 *
 * Phase 3 — runPostEnrichmentPhases:
 *    4.   beet import -s -A monthPath (catalog into beets DB)
 *    5+.  shared processing pipeline (see libraryProcessingPipeline.js)
 */
export function runInboxImport(operationsMap, opId, inboxPath, libraryPath, pendingFiles) {
  const workingFiles = [...pendingFiles];
  const { patch, appendOutput } = createOpHelpers(operationsMap, opId);

  (async () => {
    try {
      requireBinary("mp3val", "Install with: brew install mp3val");
      requireBinary("ffmpeg", "Install with: brew install ffmpeg");
      requireBinary(
        "ffprobe",
        "ffprobe ships with ffmpeg — install with: brew install ffmpeg",
      );

      patch({
        phase: "validating",
        processed: 0,
        total: workingFiles.length,
        currentFile: null,
        libraryPath,
        inboxPath,
      });
      const orphans = [];
      const fileInfos = new Map();
      for (let i = 0; i < workingFiles.length; i++) {
        const f = workingFiles[i];
        patch({ processed: i, currentFile: basename(f) });
        const info = readInboxFileInfo(f);
        if (!info.artist || !info.title) {
          orphans.push({ file: f, info });
        } else {
          fileInfos.set(f, info);
        }
      }
      patch({ processed: workingFiles.length, currentFile: null });

      if (orphans.length > 0) {
        const list = orphans
          .map((o) => {
            const a = o.info.artist || "(empty)";
            const t = o.info.title || "(empty)";
            return `  ${basename(o.file)}  [artist=${a}, title=${t}]`;
          })
          .join("\n");
        throw new Error(
          `Refusing to import ${orphans.length} untagged file(s) — set artist and title before re-running:\n${list}`,
        );
      }

      patch({
        phase: "checking-duplicates",
        processed: 0,
        total: workingFiles.length,
        currentFile: null,
      });
      const duplicateMatches = [];
      let dupChecked = 0;
      for (const f of workingFiles) {
        const info = fileInfos.get(f);
        patch({ processed: dupChecked, currentFile: basename(f) });
        try {
          const matches = await findLibraryMatches({ artist: info.artist, title: info.title });
          if (matches && matches.length > 0) {
            duplicateMatches.push({
              file: f,
              artist: info.artist,
              title: info.title,
              album: info.album,
              bitrate: info.bitrate,
              format: info.format,
              length: info.length,
              matches,
            });
          }
        } catch (err) {
          appendOutput(`  Duplicate check failed for ${basename(f)}: ${err.message}\n`);
        }
        dupChecked += 1;
        patch({ processed: dupChecked });
      }
      patch({ currentFile: null });

      operationsMap.set(opId, {
        ...operationsMap.get(opId),
        workingFiles,
      });

      if (duplicateMatches.length > 0) {
        patch({
          status: "awaiting_duplicate_review",
          phase: "awaiting-duplicate-review",
          duplicateMatches,
          currentFile: null,
        });
        return;
      }

      await runConversionThroughEnrichment(operationsMap, opId);
    } catch (err) {
      const current = operationsMap.get(opId) || {};
      operationsMap.set(opId, {
        ...current,
        status: "failed",
        error: err.message,
        completedAt: new Date().toISOString(),
      });
    }
  })();
}
