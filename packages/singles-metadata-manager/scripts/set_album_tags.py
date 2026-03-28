#!/usr/bin/env python3
"""
Set album tags to match parent folder names and mark as compilation.
"""

import os
import re
import sys
import argparse
from pathlib import Path

from mutagen import File
from mutagen.id3 import ID3, TALB, TCMP, TPE2, ID3NoHeaderError
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.wave import WAVE
from mutagen.aiff import AIFF


def set_mp3_tags(filepath: Path, album: str, dry_run: bool) -> bool:
    """Set tags for MP3 files using ID3v2."""
    try:
        try:
            audio = ID3(filepath)
        except ID3NoHeaderError:
            audio = ID3()

        audio['TALB'] = TALB(encoding=3, text=album)
        audio['TCMP'] = TCMP(encoding=3, text='1')
        audio['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio.delall('TRCK')  # Remove track number
        audio.delall('TPOS')  # Remove disc number

        if not dry_run:
            audio.save(filepath)
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_flac_tags(filepath: Path, album: str, dry_run: bool) -> bool:
    """Set tags for FLAC files using Vorbis comments."""
    try:
        audio = FLAC(filepath)
        audio['ALBUM'] = album
        audio['COMPILATION'] = '1'
        audio['ALBUMARTIST'] = 'Various Artists'
        if 'TRACKNUMBER' in audio:
            del audio['TRACKNUMBER']
        if 'DISCNUMBER' in audio:
            del audio['DISCNUMBER']

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_m4a_tags(filepath: Path, album: str, dry_run: bool) -> bool:
    """Set tags for M4A/MP4 files."""
    try:
        audio = MP4(filepath)
        audio['\xa9alb'] = [album]  # ©alb
        audio['cpil'] = True
        audio['aART'] = ['Various Artists']
        if 'trkn' in audio:
            del audio['trkn']
        if 'disk' in audio:
            del audio['disk']

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_wav_tags(filepath: Path, album: str, dry_run: bool) -> bool:
    """Set tags for WAV files using ID3."""
    try:
        audio = WAVE(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags['TALB'] = TALB(encoding=3, text=album)
        audio.tags['TCMP'] = TCMP(encoding=3, text='1')
        audio.tags['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio.tags.delall('TRCK')  # Remove track number
        audio.tags.delall('TPOS')  # Remove disc number

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_aiff_tags(filepath: Path, album: str, dry_run: bool) -> bool:
    """Set tags for AIFF files using ID3."""
    try:
        audio = AIFF(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags['TALB'] = TALB(encoding=3, text=album)
        audio.tags['TCMP'] = TCMP(encoding=3, text='1')
        audio.tags['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio.tags.delall('TRCK')  # Remove track number
        audio.tags.delall('TPOS')  # Remove disc number

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


HANDLERS = {
    '.mp3': set_mp3_tags,
    '.flac': set_flac_tags,
    '.m4a': set_m4a_tags,
    '.m4p': set_m4a_tags,
    '.mp4': set_m4a_tags,
    '.wav': set_wav_tags,
    '.aiff': set_aiff_tags,
    '.aif': set_aiff_tags,
}


def parse_folder_name(folder_name: str) -> str:
    """Convert folder name to album title.

    '2025-12 December' -> 'Singles - 2025-12 December'
    '2025-00 Older' -> 'Singles - 2025-00 Older'
    """
    match = re.match(r'(\d{4})-(\d{2})\s+(.+)', folder_name)
    if match:
        year, month_num, month_name = match.groups()
        return f"Singles - {year}-{month_num} {month_name}"
    return f"Singles - {folder_name}"


def process_directory(root_dir: Path, dry_run: bool, skip_folders: list[str] | None = None) -> dict:
    """Walk directory and update all audio files."""
    stats = {'processed': 0, 'skipped': 0, 'errors': 0}
    skip_set = set(skip_folders) if skip_folders else set()

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirpath = Path(dirpath)
        folder_name = dirpath.name

        # Skip the root directory itself and hidden directories
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

        # Convert folder name to "Singles - YEAR MONTH" format
        album_name = parse_folder_name(folder_name)

        print(f"\n[{folder_name}] -> \"{album_name}\" ({len(audio_files)} files)")

        for filename in audio_files:
            filepath = dirpath / filename
            ext = filepath.suffix.lower()
            handler = HANDLERS.get(ext)

            if handler:
                action = "Would set" if dry_run else "Setting"
                print(f"  {action}: {filename[:60]}...")

                if handler(filepath, album_name, dry_run):
                    stats['processed'] += 1
                else:
                    stats['errors'] += 1
            else:
                stats['skipped'] += 1

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

    album_name = parse_folder_name(folder_name)
    print(f"\n[{folder_name}] -> \"{album_name}\" ({len(audio_files)} files)")

    for filepath in audio_files:
        handler = HANDLERS.get(filepath.suffix.lower())
        if handler:
            action = "Would set" if dry_run else "Setting"
            print(f"  {action}: {filepath.name[:60]}...")
            if handler(filepath, album_name, dry_run):
                stats['processed'] += 1
            else:
                stats['errors'] += 1
        else:
            stats['skipped'] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Set album tags to match folder names'
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
    print(f"=== Album Tag Updater ({mode}) ===")
    print(f"Root: {root_dir}")
    print(f"Normalizing: album, album artist = 'Various Artists', compilation = true")
    print(f"Removing: track number, disc number")

    stats = process_directory(root_dir, args.dry_run)

    print(f"\n=== Summary ===")
    print(f"Processed: {stats['processed']}")
    print(f"Errors: {stats['errors']}")
    print(f"Skipped: {stats['skipped']}")

    if args.dry_run:
        print("\nThis was a dry run. Run without --dry-run to apply changes.")


if __name__ == '__main__':
    main()
