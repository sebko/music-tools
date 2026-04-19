import { dirname } from "path";
import { existsSync } from "fs";
import { runBeetStreaming } from "./beetsRunner.js";
import { normalizeGenresInFolders } from "./genreNormalizer.js";
import {
  SINGLES_VENV_PY,
  TAG_SCRIPT,
  ART_SCRIPT,
  spawnStream,
  parsePythonProgressLine,
  countItemsInFolders,
  createRunBeetPhase,
} from "./beetsPipelineHelpers.js";

// User-facing pipeline phases the wizard's Finalise step lets you toggle.
// The 3 internal `beet update` syncs are not in this set — they're triggered
// automatically when paired tag-mutating phases are enabled.
export const ALL_PHASES = Object.freeze([
  "checking",
  "setAlbumTags",
  "scrubbing",
  "normalizingGenres",
  "artwork",
  "ftintitle",
  "replaygain",
]);

/**
 * Run the full post-import processing pipeline over a list of month folders.
 * Used by both the inbox import flow (after `beet import`) and the setup
 * wizard's "Finalise" step (on the whole existing library).
 *
 * Phase sequence (each emits its own `phase` label for the UI):
 *   1.  checking           beet bad              (integrity check, non-fatal)
 *   2.  setAlbumTags       set_album_tags.py     (ALBUM/ALBUMARTIST/TRACK via mutagen)
 *   3.  syncingPreScrub    beet update           (sync DB before scrub round-trips it)
 *   4.  scrubbing          beet scrub            (strip legacy frames, rewrite v2.4/Vorbis)
 *   5.  syncingPostScrub   beet update
 *   6.  normalizingGenres  genreNormalizer       (null-separated TCON / multi-value Vorbis)
 *   7.  artwork            generate_album_art.py (re-embed after scrub strips it)
 *   8.  ftintitle          beet ftintitle        (move "feat. X" into title)
 *   9.  replaygain         beet replaygain       (per-track loudness — volume normalisation)
 *  10.  syncingFinal       beet update           (final DB sync)
 *
 * @param {object} opts
 * @param {string[]} opts.monthFolders  — absolute month folder paths
 * @param {(delta: object) => void} opts.patch
 * @param {(text: string) => void} opts.appendOutput
 * @param {string[]} [opts.phases]  — subset of ALL_PHASES to run; default = all.
 *   Inbox-import callers omit this and get the full pipeline.
 */
export async function runProcessingPhases({ monthFolders, patch, appendOutput, phases }) {
  if (!Array.isArray(monthFolders) || monthFolders.length === 0) {
    throw new Error("runProcessingPhases: monthFolders is required");
  }

  const enabled = phases ? new Set(phases) : new Set(ALL_PHASES);
  const ranAnyMutation =
    enabled.has("setAlbumTags") ||
    enabled.has("scrubbing") ||
    enabled.has("normalizingGenres") ||
    enabled.has("artwork") ||
    enabled.has("ftintitle") ||
    enabled.has("replaygain");

  if (!existsSync(SINGLES_VENV_PY)) {
    throw new Error(
      `Python venv missing at ${SINGLES_VENV_PY}. ` +
        `Run: cd packages/singles-metadata-manager && ./setup.sh`,
    );
  }

  const phaseTotal = countItemsInFolders(monthFolders);
  const runBeetPhase = createRunBeetPhase(patch, appendOutput);

  // set_album_tags.py and generate_album_art.py os.walk() the directory they
  // receive and process every folder inside (including the root itself). For
  // a canonical month folder like Singles/2026/2026-04 April/ we pass the
  // parent year so a setup-wizard run with many months in the same year only
  // invokes each script once per year. For a flat legacy year folder like
  // Singles/2015/ (loose audio, no month subfolder) we pass the year
  // directly — the scripts' parse_folder_name fallback turns that into
  // album "Singles - 2015" / artwork labelled "2015".
  const YEAR_RE = /^\d{4}$/;
  const pythonTargets = [
    ...new Set(
      monthFolders.map((f) => (YEAR_RE.test(f.split("/").pop()) ? f : dirname(f))),
    ),
  ];

  // ---------- Phase 1: beet bad (integrity check, non-fatal) ----------
  if (enabled.has("checking")) {
    await runBeetPhase({
      phase: "checking",
      args: ["bad"],
      monthFolders,
      phaseTotal,
      fatal: false,
    });
  }

  // ---------- Phase 2: set_album_tags.py ----------
  // Writes ALBUM / ALBUMARTIST / TRACKNUMBER via mutagen and strips legacy
  // frames. Idempotent — safe to re-run on a mature library.
  if (enabled.has("setAlbumTags")) {
    patch({ phase: "setAlbumTags", processed: 0, total: phaseTotal, currentFile: null });
    let tagProcessed = 0;
    for (const target of pythonTargets) {
      const result = await spawnStream(
        SINGLES_VENV_PY,
        [TAG_SCRIPT, target],
        (line) => {
          appendOutput(line);
          const fn = parsePythonProgressLine(line);
          if (fn) {
            tagProcessed += 1;
            patch({
              processed: Math.min(tagProcessed, phaseTotal),
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
    patch({ processed: phaseTotal, currentFile: null });
  }

  // ---------- Phase 3: beet update (pre-scrub sync) ----------
  // Critical: scrub round-trips DB values back to file tags, so we need the
  // DB to reflect the fresh file state before scrubbing.
  if (enabled.has("scrubbing")) {
    patch({ phase: "syncingPreScrub", processed: 0, total: 0, currentFile: null });
    appendOutput("Syncing beets DB before scrub...\n");
    for (const monthFolder of monthFolders) {
      await runBeetStreaming(
        ["update", `path:${monthFolder}`],
        (chunk) => appendOutput(chunk),
      );
    }
  }

  // ---------- Phase 4: beet scrub ----------
  if (enabled.has("scrubbing")) {
    await runBeetPhase({
      phase: "scrubbing",
      args: ["scrub"],
      monthFolders,
      phaseTotal,
    });
  }

  // ---------- Phase 5: beet update (post-scrub sync) ----------
  if (enabled.has("scrubbing")) {
    patch({ phase: "syncingPostScrub", processed: 0, total: 0, currentFile: null });
    appendOutput("Syncing beets DB after scrub...\n");
    for (const monthFolder of monthFolders) {
      await runBeetStreaming(
        ["update", `path:${monthFolder}`],
        (chunk) => appendOutput(chunk),
      );
    }
  }

  // ---------- Phase 6: normalise genre encoding ----------
  // Ensures ID3v2.4 TCON is null-separated and Vorbis uses multiple GENRE
  // tags (Pentaton iOS requirement). Runs after scrub because scrub can
  // collapse multi-value genres into joined strings.
  if (enabled.has("normalizingGenres")) {
    patch({ phase: "normalizingGenres", processed: 0, total: phaseTotal, currentFile: null });
    let genreProcessed = 0;
    await normalizeGenresInFolders(monthFolders, {
      onFile: ({ filePath, action }) => {
        genreProcessed += 1;
        patch({
          processed: Math.min(genreProcessed, phaseTotal),
          currentFile: filePath.split("/").pop(),
        });
        appendOutput(`${action}: ${filePath.split("/").pop()}\n`);
      },
    });
    patch({ processed: phaseTotal, currentFile: null });
  }

  // ---------- Phase 7: generate_album_art.py ----------
  // Scrub strips embedded art — re-embed now that tag frames are clean.
  if (enabled.has("artwork")) {
    patch({ phase: "artwork", processed: 0, total: phaseTotal, currentFile: null });
    let artProcessed = 0;
    for (const target of pythonTargets) {
      const result = await spawnStream(
        SINGLES_VENV_PY,
        [ART_SCRIPT, target],
        (line) => {
          appendOutput(line);
          const fn = parsePythonProgressLine(line);
          if (fn) {
            artProcessed += 1;
            patch({
              processed: Math.min(artProcessed, phaseTotal),
              currentFile: fn,
            });
          }
        },
      );
      if (result.code !== 0) {
        throw new Error(
          `generate_album_art.py failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
        );
      }
    }
    patch({ processed: phaseTotal, currentFile: null });
  }

  // ---------- Phase 8: beet ftintitle ----------
  if (enabled.has("ftintitle")) {
    await runBeetPhase({
      phase: "ftintitle",
      args: ["ftintitle"],
      monthFolders,
      phaseTotal,
    });
  }

  // ---------- Phase 9: beet replaygain (volume normalisation) ----------
  if (enabled.has("replaygain")) {
    await runBeetPhase({
      phase: "replaygain",
      args: ["replaygain"],
      monthFolders,
      phaseTotal,
    });
  }

  // ---------- Phase 10: final beet update ----------
  if (ranAnyMutation) {
    patch({ phase: "syncingFinal", processed: 0, total: 0, currentFile: null });
    const updateResult = await runBeetStreaming(["update"], (chunk) => appendOutput(chunk));
    if (updateResult.code !== 0) {
      throw new Error(
        `beet update failed (exit ${updateResult.code}): ${updateResult.stderr || "(no stderr)"}`,
      );
    }
  }
}
