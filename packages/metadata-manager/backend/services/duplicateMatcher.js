import { runBeet } from "./beetsRunner.js";

const FIELD_FORMAT = "$id|$path|$artist|$title|$album|$bitrate|$format|$length|$added";

// Strip the bits beets' substring matcher won't tolerate: parenthesised
// suffixes like "(feat. X)" / "(Remastered)", trailing "feat. X" in the
// artist field, and ampersands. Library side stays untouched — beets'
// own substring match on the normalised query catches both shapes
// ("Drake feat. Future" and "Drake" both substring-match "Drake").
function normalizeForQuery(value) {
  return (value || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/\bfeat\.?\b.*$/i, " ")
    .replace(/\bft\.?\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Each row is `id|path|artist|title|album|bitrate|format|length|added`.
// Path is the only field that may legitimately contain `|`, so we split
// on `|` from the right after grabbing id from the left.
function parseRow(line) {
  const parts = line.split("|");
  if (parts.length < 9) return null;
  const [id, ...rest] = parts;
  // tail = last 7 fields (artist..added); path = everything between
  const tail = rest.slice(-7);
  const path = rest.slice(0, rest.length - 7).join("|");
  const [artist, title, album, bitrate, format, length, added] = tail;
  return {
    id: Number(id),
    path,
    artist,
    title,
    album,
    bitrate: Number(bitrate) || 0,
    format,
    length: Number(length) || 0,
    added: Number(added) || 0,
  };
}

// Look up the beets library for tracks matching this inbox file's
// (artist, title). Returns the array of matches (possibly empty) or
// `null` if either field is missing after normalisation.
export async function findLibraryMatches({ artist, title }) {
  const a = normalizeForQuery(artist);
  const t = normalizeForQuery(title);
  if (!a || !t) return null;
  const result = await runBeet([
    "ls", "-p", "-f", FIELD_FORMAT,
    `artist:${a}`,
    `title:${t}`,
  ]);
  if (result.code !== 0) {
    console.error(
      `[duplicateMatcher] beet ls failed (exit ${result.code}): ${result.stderr || "(no stderr)"}`,
    );
    return [];
  }
  if (!result.stdout) return [];
  return result.stdout.split("\n").map(parseRow).filter(Boolean);
}
