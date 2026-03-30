#!/usr/bin/env python3
"""
Generate and embed album art with "Singles - YEAR MONTH" text.
"""

import os
import io
import re
import sys
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from mutagen import File
from mutagen.mp3 import MP3
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover
from mutagen.wave import WAVE
from mutagen.aiff import AIFF
from mutagen.id3 import ID3, APIC, ID3NoHeaderError


# Image settings
IMG_SIZE = 500
BG_COLOR = (30, 30, 30)  # Dark gray
TEXT_COLOR = (255, 255, 255)  # White


def parse_folder_name(folder_name: str) -> str:
    """Convert folder name to display text.

    '2025-12 December' -> 'Singles - 2025-12 December'
    '2025-00 Older' -> 'Singles - 2025-00 Older'
    """
    # Try to extract year, month number, and month name
    match = re.match(r'(\d{4})-(\d{2})\s+(.+)', folder_name)
    if match:
        year, month_num, month_name = match.groups()
        return f"{year}-{month_num} {month_name}"
    return folder_name


def generate_album_art(text: str) -> bytes:
    """Generate album art image with centered text."""
    img = Image.new('RGB', (IMG_SIZE, IMG_SIZE), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Try to use a nice font, fall back to default
    font_size = 36
    try:
        # Try common macOS fonts
        for font_name in ['/System/Library/Fonts/Helvetica.ttc',
                          '/System/Library/Fonts/SFNSText.ttf',
                          '/Library/Fonts/Arial.ttf']:
            if os.path.exists(font_name):
                font = ImageFont.truetype(font_name, font_size)
                break
        else:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    # Get text bounding box and center it
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (IMG_SIZE - text_width) // 2
    y = (IMG_SIZE - text_height) // 2

    draw.text((x, y), text, fill=TEXT_COLOR, font=font)

    # Save to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=90)
    return buffer.getvalue()


def embed_art_mp3(filepath: Path, art_data: bytes) -> bool:
    """Embed album art in MP3 file."""
    try:
        try:
            audio = ID3(filepath)
        except ID3NoHeaderError:
            audio = ID3()

        # Remove existing artwork
        audio.delall('APIC')

        # Add new artwork
        audio['APIC'] = APIC(
            encoding=3,
            mime='image/jpeg',
            type=3,  # Cover (front)
            desc='Cover',
            data=art_data
        )
        audio.save(filepath)
        return True
    except Exception as e:
        print(f"  ERROR (MP3): {e}")
        return False


def embed_art_flac(filepath: Path, art_data: bytes) -> bool:
    """Embed album art in FLAC file."""
    try:
        audio = FLAC(filepath)

        # Clear existing pictures
        audio.clear_pictures()

        # Create new picture
        pic = Picture()
        pic.type = 3  # Cover (front)
        pic.mime = 'image/jpeg'
        pic.desc = 'Cover'
        pic.data = art_data

        audio.add_picture(pic)
        audio.save()
        return True
    except Exception as e:
        print(f"  ERROR (FLAC): {e}")
        return False


def embed_art_m4a(filepath: Path, art_data: bytes) -> bool:
    """Embed album art in M4A file."""
    try:
        audio = MP4(filepath)
        audio['covr'] = [MP4Cover(art_data, imageformat=MP4Cover.FORMAT_JPEG)]
        audio.save()
        return True
    except Exception as e:
        print(f"  ERROR (M4A): {e}")
        return False


def embed_art_wav(filepath: Path, art_data: bytes) -> bool:
    """Embed album art in WAV file."""
    try:
        audio = WAVE(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags.delall('APIC')
        audio.tags['APIC'] = APIC(
            encoding=3,
            mime='image/jpeg',
            type=3,
            desc='Cover',
            data=art_data
        )
        audio.save()
        return True
    except Exception as e:
        print(f"  ERROR (WAV): {e}")
        return False


def embed_art_aiff(filepath: Path, art_data: bytes) -> bool:
    """Embed album art in AIFF file."""
    try:
        audio = AIFF(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags.delall('APIC')
        audio.tags['APIC'] = APIC(
            encoding=3,
            mime='image/jpeg',
            type=3,
            desc='Cover',
            data=art_data
        )
        audio.save()
        return True
    except Exception as e:
        print(f"  ERROR (AIFF): {e}")
        return False


HANDLERS = {
    '.mp3': embed_art_mp3,
    '.flac': embed_art_flac,
    '.m4a': embed_art_m4a,
    '.m4p': embed_art_m4a,
    '.mp4': embed_art_m4a,
    '.wav': embed_art_wav,
    '.aiff': embed_art_aiff,
    '.aif': embed_art_aiff,
}


def process_directory(root_dir: Path, dry_run: bool, skip_folders: list[str] | None = None,
                      progress=None) -> dict:
    """Walk directory and embed album art in all audio files."""
    stats = {'processed': 0, 'skipped': 0, 'errors': 0}
    art_cache = {}  # Cache generated art per folder
    skip_set = set(skip_folders) if skip_folders else set()

    if progress:
        progress.set_phase("art")

    folders_done = 0
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirpath = Path(dirpath)
        folder_name = dirpath.name

        # Skip root and hidden directories
        if dirpath == root_dir or folder_name.startswith('.'):
            continue

        # Skip folders matching any skip pattern
        if folder_name in skip_set:
            print(f"\n[{folder_name}] SKIPPED")
            dirnames.clear()
            continue

        audio_files = [f for f in filenames if Path(f).suffix.lower() in HANDLERS]

        if not audio_files:
            continue

        # Generate art text from folder name
        art_text = parse_folder_name(folder_name)
        print(f"\n[{folder_name}] -> \"{art_text}\" ({len(audio_files)} files)")

        if progress:
            progress.update(folder_name, folders_done, 0, len(audio_files))

        # Generate or retrieve cached art
        if art_text not in art_cache:
            art_cache[art_text] = generate_album_art(art_text)
        art_data = art_cache[art_text]

        file_num = 0
        for filename in audio_files:
            filepath = dirpath / filename
            ext = filepath.suffix.lower()
            handler = HANDLERS.get(ext)

            if handler:
                action = "Would embed" if dry_run else "Embedding"
                print(f"  {action}: {filename[:55]}...")

                if not dry_run:
                    if handler(filepath, art_data):
                        stats['processed'] += 1
                    else:
                        stats['errors'] += 1
                else:
                    stats['processed'] += 1
                file_num += 1
                if progress:
                    progress.update(folder_name, folders_done, file_num, len(audio_files))
            else:
                stats['skipped'] += 1

        folders_done += 1

    return stats


def process_single_folder(folder_path: Path, dry_run: bool = False) -> dict:
    """Process audio files in a single folder (no recursion)."""
    stats = {'processed': 0, 'skipped': 0, 'errors': 0}
    folder_name = folder_path.name

    if folder_name.startswith('.'):
        return stats

    audio_files = [f for f in folder_path.iterdir()
                   if f.is_file() and f.suffix.lower() in HANDLERS]

    if not audio_files:
        return stats

    art_text = parse_folder_name(folder_name)
    print(f"\n[{folder_name}] -> \"{art_text}\" ({len(audio_files)} files)")
    art_data = generate_album_art(art_text)

    for filepath in audio_files:
        handler = HANDLERS.get(filepath.suffix.lower())
        if handler:
            action = "Would embed" if dry_run else "Embedding"
            print(f"  {action}: {filepath.name[:55]}...")
            if not dry_run:
                if handler(filepath, art_data):
                    stats['processed'] += 1
                else:
                    stats['errors'] += 1
            else:
                stats['processed'] += 1
        else:
            stats['skipped'] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Generate and embed album art with folder-based text'
    )
    parser.add_argument(
        'directory',
        help='Root directory to process (e.g. Singles/)'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Preview changes without modifying files'
    )

    args = parser.parse_args()
    root_dir = Path(args.directory).resolve()

    if not root_dir.is_dir():
        print(f"Error: {root_dir} is not a directory")
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"=== Album Art Generator ({mode}) ===")
    print(f"Root: {root_dir}")
    print(f"Style: Dark background, white text")
    print(f"Format: 'YEAR-MM MONTH'")

    stats = process_directory(root_dir, args.dry_run)

    print(f"\n=== Summary ===")
    print(f"Processed: {stats['processed']}")
    print(f"Errors: {stats['errors']}")
    print(f"Skipped: {stats['skipped']}")

    if args.dry_run:
        print("\nThis was a dry run. Run without --dry-run to apply changes.")


if __name__ == '__main__':
    main()
