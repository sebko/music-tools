#!/usr/bin/env node
/**
 * Standalone test: tag one MP3 and one FLAC with a multi-value genre list
 * using the candidate encoders, then emit verification output so the user
 * can AirDrop the results to Pentaton and confirm which encoding splits.
 *
 * Usage:
 *   node backend/scripts/test-genre-encoding.js <sample1> [sample2] [...]
 *
 * Each argument may be an MP3 or a FLAC. MP3s are tagged via node-id3,
 * FLACs via metaflac. Output files go to /tmp/pentaton-genre-test/.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import NodeID3 from "node-id3tag";

const GENRES = ["Deep House", "Techno", "Minimal"];
const OUT_DIR = "/tmp/pentaton-genre-test";

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  die("usage: test-genre-encoding.js <sample1> [sample2] [...]");
}

mkdirSync(OUT_DIR, { recursive: true });

function tagMp3(srcPath, outPath) {
  copyFileSync(srcPath, outPath);
  console.log(`\n=== MP3: ${outPath} ===`);

  // node-id3tag's update() is broken for text frames (it converts aliases to
  // raw keys, and write() only matches aliases). Workaround: read existing
  // tags as aliases, strip `raw`, override genre with the array, and write.
  const existing = NodeID3.read(outPath) || {};
  delete existing.raw;
  const merged = { ...existing, genre: GENRES };
  const result = NodeID3.write(merged, outPath);
  if (result !== true) die(`node-id3tag write failed: ${JSON.stringify(result)}`);
  console.log(`wrote genres via node-id3tag: ${JSON.stringify(GENRES)}`);

  const readBack = NodeID3.read(outPath);
  console.log(
    `read-back: title=${JSON.stringify(readBack.title)} artist=${JSON.stringify(
      readBack.artist
    )} genre=${JSON.stringify(readBack.genre)}`
  );

  console.log("\nffprobe:");
  try {
    const probe = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format_tags",
        "-of",
        "default=noprint_wrappers=1",
        outPath,
      ],
      { encoding: "utf8" }
    );
    process.stdout.write(probe);
  } catch (err) {
    console.error(err.message);
  }

  console.log("\nTCON frame hex scan (looking for null-byte separators):");
  const buf = readFileSync(outPath);
  const tconIdx = buf.indexOf("TCON");
  if (tconIdx === -1) {
    console.log("  (no TCON frame found)");
  } else {
    const slice = buf.subarray(tconIdx, tconIdx + 80);
    const hex = slice
      .toString("hex")
      .match(/.{1,2}/g)
      .join(" ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
      .join("");
    console.log(`  hex:   ${hex}`);
    console.log(`  ascii: ${ascii}`);
  }
}

function tagFlac(srcPath, outPath) {
  copyFileSync(srcPath, outPath);
  console.log(`\n=== FLAC: ${outPath} ===`);
  execFileSync("metaflac", ["--remove-tag=GENRE", outPath]);
  const setTagArgs = GENRES.map((g) => `--set-tag=GENRE=${g}`);
  execFileSync("metaflac", [...setTagArgs, outPath]);
  console.log(`wrote genres via metaflac: ${JSON.stringify(GENRES)}`);

  console.log("\nmetaflac --export-tags-to=-:");
  const tags = execFileSync("metaflac", ["--export-tags-to=-", outPath], {
    encoding: "utf8",
  });
  process.stdout.write(tags);
}

const outputs = [];
for (const src of inputs) {
  const ext = path.extname(src).toLowerCase();
  const base = path.basename(src, ext).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const out = path.join(OUT_DIR, `${base}${ext}`);
  if (ext === ".mp3") {
    tagMp3(src, out);
  } else if (ext === ".flac") {
    tagFlac(src, out);
  } else {
    console.warn(`skipping unsupported file: ${src}`);
    continue;
  }
  outputs.push(out);
}

console.log("\n---");
console.log(`Output files ready for AirDrop to Pentaton:`);
for (const o of outputs) console.log(`  ${o}`);
console.log(
  `\nExpected result: Pentaton should show 3 separate genre tags ("Deep House", "Techno", "Minimal") on each file.`
);
