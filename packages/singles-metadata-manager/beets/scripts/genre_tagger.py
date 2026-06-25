#!/usr/bin/env python3
"""Assign genres to beets library items using Claude AI."""

import json
import os
import sqlite3
import sys

import anthropic
from mutagen.flac import FLAC
from mutagen.id3 import ID3, ID3NoHeaderError, TCON

# Load API key from root .env
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
with open(ENV_PATH) as f:
    for line in f:
        if line.startswith("ANTHROPIC_API_KEY="):
            os.environ["ANTHROPIC_API_KEY"] = line.strip().split("=", 1)[1]

BEETS_DB = os.path.expanduser("~/.config/beets/library.db")
BATCH_SIZE = 40  # tracks per Claude request
MODEL = "claude-sonnet-4-20250514"

SYSTEM_PROMPT = """You are a music genre expert. Given a list of tracks with their metadata, assign 1-3 specific genres to each track.

Rules:
- Be specific: "Dubstep" not "Electronic", "Disco" not "Dance", "Southern Hip Hop" not "Hip Hop"
- Use well-known genre names, not Last.fm freeform tags
- If you recognise the track, use your knowledge of it
- If metadata is messy (e.g. artist crammed into title field), use your best judgement to identify the track
- Return ONLY valid JSON, no markdown fencing

Return a JSON array where each object has:
- "id": the item ID (integer)
- "genres": array of 1-3 genre strings

Example: [{"id": 1, "genres": ["Disco", "Funk"]}, {"id": 2, "genres": ["Hip Hop"]}]"""


def get_items(db_path, query=None):
    """Fetch items from beets DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    sql = "SELECT id, path, artist, title, album, genres FROM items"
    if query:
        sql += f" WHERE {query}"
    rows = conn.execute(sql).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def write_genres_to_file(raw_path, genres):
    """Write a multi-value genre list to an audio file using the right
    per-format encoding for DJ apps that expect real multi-value fields
    (verified against Pentaton iOS on 2026-04-14).

    MP3  → ID3v2.4 TCON, null-byte separated (mutagen handles this when
            TCON.text is a list).
    FLAC → separate Vorbis GENRE= comments (mutagen handles this when
            audio["genre"] is a list).
    """
    path = raw_path.decode("utf-8") if isinstance(raw_path, bytes) else raw_path
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".mp3":
            try:
                tags = ID3(path)
            except ID3NoHeaderError:
                tags = ID3()
            tags.delall("TCON")
            tags.add(TCON(encoding=3, text=genres))
            tags.save(path, v2_version=4)
        elif ext == ".flac":
            audio = FLAC(path)
            audio["genre"] = genres
            audio.save()
        else:
            print(f"  (skip {path}: unsupported format)")
    except Exception as exc:
        print(f"  ERROR writing genres to {path}: {exc}")


def build_prompt(items):
    """Build the user prompt with track listing."""
    lines = []
    for item in items:
        parts = [f"ID:{item['id']}"]
        if item["artist"]:
            parts.append(f"Artist: {item['artist']}")
        if item["title"]:
            parts.append(f"Title: {item['title']}")
        if item["album"]:
            parts.append(f"Album: {item['album']}")
        if item["genres"]:
            parts.append(f"Current genres: {item['genres']}")
        lines.append(" | ".join(parts))
    return "Assign genres to these tracks:\n\n" + "\n".join(lines)


def call_claude(items):
    """Send batch to Claude and parse response."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(items)}],
    )
    text = response.content[0].text.strip()
    # Strip markdown fencing if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def update_genres(db_path, results, dry_run=False):
    """Write genres back to beets DB and to the underlying audio files."""
    conn = sqlite3.connect(db_path)
    updated = 0
    for r in results:
        genres = r["genres"]
        genre_str = "; ".join(genres)
        item_id = r["id"]
        row = conn.execute(
            "SELECT path, artist, title FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if dry_run:
            artist, title = (row[1], row[2]) if row else ("?", "?")
            print(f"  {artist} - {title} → {genre_str}")
            continue

        # beets keeps its "; "-joined convention internally for display
        conn.execute(
            "UPDATE items SET genres = ? WHERE id = ?", (genre_str, item_id)
        )
        if row and row[0]:
            write_genres_to_file(row[0], genres)
        updated += 1
    if not dry_run:
        conn.commit()
    conn.close()
    return updated


def main():
    dry_run = "--dry-run" in sys.argv
    query = None
    for arg in sys.argv[1:]:
        if arg != "--dry-run":
            query = arg
            break

    if not os.path.exists(BEETS_DB):
        print(f"Beets DB not found at {BEETS_DB}")
        sys.exit(1)

    items = get_items(BEETS_DB, query)
    if not items:
        print("No items found.")
        sys.exit(0)

    print(f"{'[DRY RUN] ' if dry_run else ''}Processing {len(items)} tracks...")

    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i : i + BATCH_SIZE]
        print(f"\nBatch {i // BATCH_SIZE + 1} ({len(batch)} tracks):")
        results = call_claude(batch)
        update_genres(BEETS_DB, results, dry_run)

    if not dry_run:
        print(f"\nDone. Updated {len(items)} tracks (DB + files).")


if __name__ == "__main__":
    main()
