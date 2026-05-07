#!/usr/bin/env python3
"""
Fetch last.fm genre suggestions for a list of file paths using beets'
lastgenre plugin, WITHOUT writing anything to disk or the DB.

Usage:
    lastgenre_suggest.py <filepath> [<filepath> ...]

Output (stdout):
    JSON object { "<filepath>": ["Genre 1", "Genre 2", ...], ... }
    Missing or errored files are omitted.

Reads the user's real beets library DB via the standard beets config
loader (so it inherits `directory:` and `library:` from ~/.config/beets).
Each input file path is looked up in the DB as a beets Item; we then
call LastGenrePlugin._get_genre(item) which returns (genres, label).
No .write() or lib.store() calls — this is read-only.
"""

import json
import signal
import sys

from beets import config as beets_config
from beets import library as beets_library


# Hard cap on a single _get_genre() call. pylast's HTTP layer can hang
# well past anything that feels reasonable in the interactive UI, and
# one slow track was freezing the whole card for the outer 120 s budget.
PER_TRACK_TIMEOUT_SECONDS = 8


class LastfmTimeout(Exception):
    pass


def _alarm_handler(signum, frame):
    raise LastfmTimeout(
        f"last.fm call exceeded per-track budget ({PER_TRACK_TIMEOUT_SECONDS}s)"
    )


def main() -> int:
    paths = sys.argv[1:]
    if not paths:
        json.dump({}, sys.stdout)
        return 0

    # Force source:track for per-track specificity (singles library).
    # `force` + `keep_existing:false` make the suggestions reflect ONLY
    # what last.fm returned, not a merge with whatever's already on the
    # track — the UI is the place the user combines sources.
    beets_config["lastgenre"]["source"] = "track"
    beets_config["lastgenre"]["force"] = True
    beets_config["lastgenre"]["keep_existing"] = False
    beets_config["lastgenre"]["count"] = 5

    # Import AFTER config is loaded so the plugin picks up our overrides.
    from beetsplug.lastgenre import LastGenrePlugin

    lib_path = str(beets_config["library"].as_filename())
    directory = str(beets_config["directory"].as_filename())
    lib = beets_library.Library(lib_path, directory)
    plugin = LastGenrePlugin()

    signal.signal(signal.SIGALRM, _alarm_handler)

    suggestions: dict[str, list[str]] = {}
    for raw_path in paths:
        try:
            # Beets stores `path` as bytes; query by the text form. Inbox
            # files haven't been `beet import`ed yet at review time, so fall
            # back to reading tags directly off disk via Item.from_path so
            # the plugin still has artist/title to query last.fm with.
            items = list(lib.items(f'path:"{raw_path}"'))
            item = items[0] if items else beets_library.Item.from_path(raw_path)
            signal.alarm(PER_TRACK_TIMEOUT_SECONDS)
            try:
                genres, label = plugin._get_genre(item)
            finally:
                signal.alarm(0)
            if genres:
                # _get_genre returns a semicolon-separated string-ish list in
                # some beets versions and a real list in others. Normalize.
                if isinstance(genres, str):
                    parts = [g.strip() for g in genres.split(";") if g.strip()]
                else:
                    parts = [str(g).strip() for g in genres if str(g).strip()]
                suggestions[raw_path] = parts
                print(f"[lastgenre] {raw_path}: {parts} ({label})", file=sys.stderr)
            else:
                print(f"[lastgenre] no genres for {raw_path}", file=sys.stderr)
        except Exception as err:  # noqa: BLE001
            # Non-fatal — log and keep going. Missing network, rate-limit,
            # malformed item, etc. should not abort the whole batch.
            print(f"[lastgenre] error on {raw_path}: {err}", file=sys.stderr)

    json.dump(suggestions, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
