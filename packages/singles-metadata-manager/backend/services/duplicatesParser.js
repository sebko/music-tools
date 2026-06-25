/**
 * Parse `beet duplicates -s --full -f '<tab-delimited>'` output.
 *
 * Expected format per line (from the `-f` template we pass in server.js):
 *   $id\t$path\t$bitrate\t$format\t$length\t$added\t$artist\t$title\t$album
 *
 * The beets duplicates plugin hardcodes a `: <count>` suffix on every printed
 * item (see beetsplug/duplicates.py — `fmt=f"{fmt_tmpl}: {obj_count}"`) where
 * count is the number of items in that duplicate group. We use that suffix to
 * walk the output in fixed-size chunks: each group's items are printed
 * consecutively and all carry the same `: N`, so consuming N lines at a time
 * reconstructs groups exactly as beets saw them — no key collisions from
 * lossy $length formatting, no need to re-sort.
 *
 * Tab is the field delimiter because it will never appear in a filename,
 * title, or album name, and beets' Template engine passes it through literally.
 */

export function parseDuplicatesOutput(stdout) {
  if (!stdout || typeof stdout !== "string") return [];

  const rows = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const suffixMatch = line.match(/: (\d+)$/);
    if (!suffixMatch) continue;
    const count = Number(suffixMatch[1]);
    const rest = line.slice(0, suffixMatch.index);
    const fields = rest.split("\t");
    if (fields.length !== 9) continue;
    const [id, path, bitrate, format, lengthStr, added, artist, title, album] = fields;
    rows.push({
      id: Number(id),
      path,
      bitrate: Number(bitrate) || 0,
      format,
      length: parseLengthFormat(lengthStr),
      added, // leave as string; default beets `time_format` sorts lexically
      artist,
      title,
      album,
      _count: count,
    });
  }

  const groups = [];
  let i = 0;
  while (i < rows.length) {
    const n = rows[i]._count;
    if (!n || n < 2) {
      i += 1;
      continue;
    }
    const chunk = rows.slice(i, i + n);
    if (chunk.length < n) break; // output truncated mid-group — bail safely
    groups.push(buildGroup(chunk));
    i += n;
  }

  return groups.sort((a, b) => b.count - a.count);
}

/**
 * Score a path by how "clean" its filename is. Higher = cleaner.
 * Penalizes date-stamp artifacts ("04.55.09"), copy suffixes (" 2."), and
 * excessive length — common in Dropbox conflict copies and timestamped backups.
 */
export function pathCleanlinessScore(path) {
  const filename = path.split("/").pop();
  let score = 0;
  // Penalize repeated date-stamp patterns like "04.55.09"
  const stamps = filename.match(/\d{2}\.\d{2}\.\d{2}/g) || [];
  score -= stamps.length * 10;
  // Penalize copy suffixes like " 2.", " 3."
  const copies = filename.match(/ \d+\./g) || [];
  score -= copies.length * 5;
  // Penalize longer filenames (more appended junk)
  score -= Math.max(0, filename.length - 40);
  return score;
}

function buildGroup(chunk) {
  // Keeper heuristic: highest bitrate → cleanest path → newest added → lowest id.
  const sorted = [...chunk].sort((a, b) => {
    if (b.bitrate !== a.bitrate) return b.bitrate - a.bitrate;
    const aClean = pathCleanlinessScore(a.path);
    const bClean = pathCleanlinessScore(b.path);
    if (bClean !== aClean) return bClean - aClean;
    if (b.added !== a.added) return b.added.localeCompare(a.added);
    return a.id - b.id;
  });
  const keeperId = sorted[0].id;
  return {
    label: formatGroupLabel(sorted[0]),
    count: sorted.length,
    items: sorted.map(({ _count, ...item }) => ({
      ...item,
      isKeeper: item.id === keeperId,
    })),
  };
}

function formatGroupLabel(item) {
  const parts = [];
  if (item.artist) parts.push(item.artist);
  if (item.title) parts.push(item.title);
  const base = parts.join(" — ");
  return item.album ? `${base} (${item.album})` : base || "(unknown)";
}

/**
 * beets' default `format_raw_length` is false, so `$length` renders as
 * `M:SS` (or `H:MM:SS` for long items). Convert back to seconds so the UI
 * can show a duration consistently.
 */
function parseLengthFormat(s) {
  if (!s) return 0;
  const parts = s.split(":");
  if (parts.length === 1) return Number(parts[0]) || 0;
  if (parts.length === 2) {
    return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
  }
  if (parts.length === 3) {
    return (
      (Number(parts[0]) || 0) * 3600 +
      (Number(parts[1]) || 0) * 60 +
      (Number(parts[2]) || 0)
    );
  }
  return 0;
}
