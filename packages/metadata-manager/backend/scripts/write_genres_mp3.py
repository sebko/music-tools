#!/usr/bin/env python3
"""
Write a multi-value TCON (genre) frame to an MP3 file using mutagen.

Usage:
    write_genres_mp3.py <filepath> <genre1> [<genre2> ...]

We use mutagen instead of node-id3tag because node-id3tag.write() has a
serialization bug: when the existing tags include both USLT (lyrics) and
APIC (cover art), it returns true but silently drops TCON. mutagen
handles ID3v2.4 multi-value frames correctly.
"""

import sys

from mutagen.id3 import ID3, TCON, ID3NoHeaderError


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: write_genres_mp3.py <filepath> <genre> [<genre> ...]", file=sys.stderr)
        return 2

    filepath = sys.argv[1]
    genres = sys.argv[2:]

    try:
        tag = ID3(filepath)
    except ID3NoHeaderError:
        tag = ID3()

    tag.delall("TCON")
    tag.add(TCON(encoding=3, text=genres))
    tag.save(filepath, v2_version=4)
    return 0


if __name__ == "__main__":
    sys.exit(main())
