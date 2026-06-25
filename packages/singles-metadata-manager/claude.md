# Beets Music Management — DJ Singles Library

## 1. Goal

Manage a DJ singles library on an external volume (`/Volumes/T7/DJ Library/Singles`) using beets as a catalog and a custom Node + Python pipeline as the tagger. The library is organized chronologically by the date a file was added to the collection. The **file structure is the primary record of history** — the system must remain portable even if the beets database is lost.

### Folder layout

```
DJ Library/Singles/YYYY/YYYY-MM MonthName/Artist - Title.mp3
```

Example: `DJ Library/Singles/2026/2026-04 April/Aphex Twin - Alberto Balsalm.mp3`

## 2. Why no MusicBrainz autotagging

This pipeline deliberately does **not** use MusicBrainz autotagging. Tags are written by:

1. `set_album_tags.py` (singles-metadata-manager) — sets ALBUM / ALBUMARTIST / TRACKNUMBER and strips legacy ID3 fields.
2. `generate_album_art.py` (singles-metadata-manager) — embeds a generated 500×500 month-label JPEG.
3. The Claude AI Genre Tagger (Genres page) — assigns 1–3 specific genres per track.

`beet import` is invoked with `-s -A` (singleton, As-Is). MusicBrainz lookups are off. This keeps the pipeline deterministic and avoids MB matching dragging in unwanted album/disc/compilation metadata.

## 3. Global config (`~/.config/beets/config.yaml`)

```yaml
plugins: fetchart duplicates scrub edit badfiles ftintitle replaygain
directory: /Volumes/T7/DJ Library/Singles
import:
  move: false
  copy: false
  write: true
  incremental: true
  singletons: true
  duplicate_action: keep
  autotag: no   # ← MusicBrainz lookups disabled
```

Plugin notes:

- `badfiles` — runs `mp3val` / `flac -t` to catch corrupt files. Requires `brew install mp3val`.
- `scrub` — strips every tag frame and re-writes from the beets DB; this is how we normalize old files to ID3v2.4 / clean Vorbis.
- `ftintitle` — moves "(feat. X)" from the artist field into the title.
- `replaygain` — per-track loudness tags, ffmpeg backend (no `bs1770gain` install needed).

## 4. Inbox import pipeline (one button click in the UI)

`backend/services/inboxImportRunner.js` runs these phases in order against files dropped into `~/Downloads/Inbox`:

1. **Convert** non-mp3/flac files via ffmpeg (ogg/opus/aac/m4a/wma → mp3 320k; wav/aiff → flac).
2. **Move** to `YYYY/YYYY-MM Month/`. Same-name collisions get `(2)`, `(3)` suffixes — never overwrite.
3. **`beet import -s -A <month>`** — catalog only.
4. **`beet bad <month>`** — integrity check; warnings logged but never abort the run.
5. **`set_album_tags.py <month>`** — write album/albumartist/track via mutagen.
6. **`beet update <month>`** — sync DB after the mutagen writes (critical: scrub round-trips DB values).
7. **`beet scrub <month>`** — normalize ID3v2.4 / Vorbis, strip legacy frames.
8. **`generate_album_art.py <month>`** — embed cover art (runs after scrub, since scrub strips art).
9. **`beet ftintitle <month>`** — move "feat. X" out of artist.
10. **`beet replaygain <month>`** — compute loudness tags.
11. **`beet update`** — final DB sync.

## 5. Maintenance & safety rules

- **No album logic.** Always pass `-s` to `beet import`. The library is intentionally flat-track.
- **Path queries:** use `path:<absolute folder>` to scope plugin runs to a single month. Avoid running `beet replaygain` (etc.) library-wide unless you mean it — it's slow.
- **Verify date indexing:** `beet ls added:2026-04` should list this month's imports.
- **Escape spaces** in `/DJ Library/` for any shell command run by hand.
- **Idempotency:** `import incremental:true` plus `replaygain.overwrite:false` make re-runs near-instant.

## 6. System rebuild (new machine)

If the library moves to a new machine, the `mtime` plugin should be installed and configured (`operation: added`) before re-importing so beets reads each file's filesystem ctime as `$added`. The current pipeline routes new files into the month folder via Node, so `mtime` is not strictly required day-to-day — but a fresh import of the existing T7 library would lose chronological ordering without it.
