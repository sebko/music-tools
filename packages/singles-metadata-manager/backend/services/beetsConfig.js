import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import yaml from "js-yaml";

const BEETS_CONFIG_DIR = join(homedir(), ".config", "beets");
const BEETS_CONFIG_PATH = join(BEETS_CONFIG_DIR, "config.yaml");
const BEETS_LIBRARY_DB_PATH = join(BEETS_CONFIG_DIR, "library.db");

export function getBeetsConfigPath() {
  return BEETS_CONFIG_PATH;
}

export function getBeetsLibraryDbPath() {
  return BEETS_LIBRARY_DB_PATH;
}

export async function readBeetsConfig() {
  try {
    const raw = await readFile(BEETS_CONFIG_PATH, "utf8");
    return yaml.load(raw) ?? {};
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Writes the beets config file, creating parent dir if missing.
 * Preserves all existing keys — caller mutates the loaded object.
 */
export async function writeBeetsConfig(config) {
  await mkdir(dirname(BEETS_CONFIG_PATH), { recursive: true });
  const dumped = yaml.dump(config, { lineWidth: 120, noRefs: true });
  await writeFile(BEETS_CONFIG_PATH, dumped, "utf8");
}

// Plugins we know how to load and actively use from the wizard / app.
const ESSENTIAL_PLUGINS = ["musicbrainz", "fetchart", "duplicates", "scrub"];

// Plugins that were flagged as manual-use-only in the project notes and
// have historically shipped broken config in this repo. We strip them
// when we rewrite so `beet` commands don't error out on every invocation.
//
// `zero` is included because it hooks the import pipeline and emits
// `cannot zero in "as-is" mode` warnings on every Identify (`beet import -L`)
// fallback even with `auto: no`. The wizard never invokes `beet zero`
// directly, so removing it from the plugin list is the cleanest fix.
const STRIP_PLUGINS = new Set(["wlg", "zero"]);

function parsePluginsList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Update the beets config for a clean, non-interactive wizard import.
 *
 * - Sets `directory` and `library` to the wizard's chosen paths.
 * - Force-rewrites the `import:` block with non-interactive defaults
 *   (fixes the "can't be both quiet and timid" conflict).
 * - Strips known-broken plugin blocks (`lastgenre`, `wlg`) and removes
 *   them from the loaded `plugins:` list. These can be re-added later
 *   if the user wants them.
 * - Preserves all other user customizations (paths, fetchart sources,
 *   duplicates keys, zero fields, etc.).
 */
export async function setBeetsLibraryDirectory(directory) {
  const existing = await readBeetsConfig();
  const config = {
    ...existing,
    directory,
    library: BEETS_LIBRARY_DB_PATH,
  };

  // Non-interactive import. Overwrites any quoted-string booleans the
  // user had (e.g. timid: 'yes') — js-yaml re-emits these as real bools.
  //
  // `quiet_fallback: asis` + `singletons: true` are what make the identify
  // step (`beet import -L`) Plex-like: every file gets a shot at MB matching,
  // matches win canonical tags, non-matches stay "as is" rather than being
  // skipped. `singletons: true` stops beets from trying to group a DJ singles
  // folder into phantom albums during matching.
  //
  // These settings are no-ops during the initial `-A` (no autotag) import, so
  // it's safe to bake them in globally — they only activate on `-L` re-tag.
  config.import = {
    ...(existing.import || {}),
    copy: false,
    move: false,
    write: true,
    incremental: true,
    quiet: true,
    timid: false,
    resume: false,
    quiet_fallback: "asis",
    singletons: true,
    // Keep duplicates instead of beets' default "skip". Without this, files
    // with identical (artist, title) tags but different filenames (e.g.
    // Dropbox conflict copies, "(2)" duplicates, timestamped backups) get
    // silently dropped during `beet import` and surface as bogus "orphans"
    // in the wizard's Cleanup step. Keeping them lets the wizard's later
    // Duplicates step surface them via `beet duplicates` so the user can
    // pick which copy to delete with the highest-bitrate keeper heuristic.
    duplicate_action: "keep",
  };

  // Strip broken plugin config blocks
  for (const p of STRIP_PLUGINS) {
    delete config[p];
  }

  // Disable auto-hooks for plugins that can crash or slow down `beet import`.
  // The wizard's Plugins step runs these explicitly later via `beet <plugin>`.
  // - scrub: crashes on files with malformed APEv2 tag blocks (mutagen ValueError)
  // - fetchart: network-bound; would make 8k-file imports glacial
  // - zero: defensive; runs on every imported file, same failure surface as scrub
  config.scrub = { ...(existing.scrub || {}), auto: false };
  config.fetchart = { ...(existing.fetchart || {}), auto: false };
  config.zero = { ...(existing.zero || {}), auto: false };

  // lastgenre: fetch last.fm genres on-demand from the enrichment service.
  // auto:false — never runs inside `beet import`; we call it via a helper
  // script. source:track and min_weight:10 are tuned for singles (per-track
  // specificity, filter out weak tags). Whitelist defaults to the bundled
  // genres.txt which keeps exotic/garbage tags out of suggestions.
  config.lastgenre = {
    ...(existing.lastgenre || {}),
    auto: false,
    source: "track",
    min_weight: 10,
    count: 5,
    title_case: true,
  };

  // Configure the `duplicates` plugin to key on (artist, title) instead of
  // its default (mb_trackid, mb_albumid). The wizard's Duplicates step calls
  // `beet duplicates -s --full` where `-s` is strict mode — only items where
  // every key field is populated are considered. With the default keys, any
  // file MusicBrainz couldn't match (no MBID) would be excluded → false
  // negatives. After the Identify step, MB-matched files all carry the same
  // canonical artist/title from MB, so an artist+title key works as well as
  // mb_trackid for them, and still works as a fallback for the unmatched
  // ones. One dedupe pass handles both populations.
  config.duplicates = { ...(existing.duplicates || {}), keys: "artist title" };

  // Rebuild plugins list: drop stripped, ensure essentials present
  const currentPlugins = parsePluginsList(existing.plugins);
  const filtered = currentPlugins.filter((p) => !STRIP_PLUGINS.has(p));
  for (const p of ESSENTIAL_PLUGINS) {
    if (!filtered.includes(p)) filtered.push(p);
  }
  config.plugins = filtered.join(" ");

  await writeBeetsConfig(config);
  return config;
}
