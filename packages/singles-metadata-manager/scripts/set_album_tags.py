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
from mutagen.id3 import ID3, TALB, TCMP, TPE2, TRCK, ID3NoHeaderError
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.wave import WAVE
from mutagen.aiff import AIFF


def set_mp3_tags(filepath: Path, album: str, track_num: int, dry_run: bool) -> bool:
    """Set tags for MP3 files using ID3v2."""
    try:
        try:
            audio = ID3(filepath)
        except ID3NoHeaderError:
            audio = ID3()

        audio['TALB'] = TALB(encoding=3, text=album)
        audio['TCMP'] = TCMP(encoding=3, text='1')
        audio['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio['TRCK'] = TRCK(encoding=3, text=str(track_num))
        audio.delall('TPOS')  # Remove disc number
        audio.delall('TSRC')  # Remove ISRC
        audio.delall('TIT1')  # Remove grouping
        audio.delall('COMM')  # Remove comments
        # Remove TXXX tags that cause disc groupings or catalog matching
        for desc in ('DISCTOTAL', 'TOTALDISCS', 'TRACKTOTAL', 'TOTALTRACKS',
                     'BARCODE', 'UPC', 'ISRC'):
            audio.delall(f'TXXX:{desc}')

        if not dry_run:
            audio.save(filepath)
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_flac_tags(filepath: Path, album: str, track_num: int, dry_run: bool) -> bool:
    """Set tags for FLAC files using Vorbis comments."""
    try:
        audio = FLAC(filepath)
        audio['ALBUM'] = album
        audio['COMPILATION'] = '1'
        audio['ALBUMARTIST'] = 'Various Artists'
        audio['TRACKNUMBER'] = str(track_num)
        if 'DISCNUMBER' in audio:
            del audio['DISCNUMBER']
        # Remove tags that cause disc groupings or catalog matching
        for tag in ('DISCTOTAL', 'TOTALDISCS', 'TRACKTOTAL', 'TOTALTRACKS',
                     'DISC', 'TRACK', 'ISRC', 'BARCODE', 'UPC',
                     'GROUPING', 'COMMENT'):
            if tag in audio:
                del audio[tag]

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_m4a_tags(filepath: Path, album: str, track_num: int, dry_run: bool) -> bool:
    """Set tags for M4A/MP4 files."""
    try:
        audio = MP4(filepath)
        audio['\xa9alb'] = [album]  # ©alb
        audio['cpil'] = True
        audio['aART'] = ['Various Artists']
        audio['trkn'] = [(track_num, 0)]
        for tag in ('disk', '----:com.apple.iTunes:ISRC', '\xa9grp', '\xa9cmt'):
            if tag in audio:
                del audio[tag]

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_wav_tags(filepath: Path, album: str, track_num: int, dry_run: bool) -> bool:
    """Set tags for WAV files using ID3."""
    try:
        audio = WAVE(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags['TALB'] = TALB(encoding=3, text=album)
        audio.tags['TCMP'] = TCMP(encoding=3, text='1')
        audio.tags['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio.tags['TRCK'] = TRCK(encoding=3, text=str(track_num))
        audio.tags.delall('TPOS')  # Remove disc number
        audio.tags.delall('TSRC')  # Remove ISRC
        audio.tags.delall('TIT1')  # Remove grouping
        audio.tags.delall('COMM')  # Remove comments
        for desc in ('DISCTOTAL', 'TOTALDISCS', 'TRACKTOTAL', 'TOTALTRACKS',
                     'BARCODE', 'UPC', 'ISRC'):
            audio.tags.delall(f'TXXX:{desc}')

        if not dry_run:
            audio.save()
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def set_aiff_tags(filepath: Path, album: str, track_num: int, dry_run: bool) -> bool:
    """Set tags for AIFF files using ID3."""
    try:
        audio = AIFF(filepath)
        if audio.tags is None:
            audio.add_tags()

        audio.tags['TALB'] = TALB(encoding=3, text=album)
        audio.tags['TCMP'] = TCMP(encoding=3, text='1')
        audio.tags['TPE2'] = TPE2(encoding=3, text='Various Artists')
        audio.tags['TRCK'] = TRCK(encoding=3, text=str(track_num))
        audio.tags.delall('TPOS')  # Remove disc number
        audio.tags.delall('TSRC')  # Remove ISRC
        audio.tags.delall('TIT1')  # Remove grouping
        audio.tags.delall('COMM')  # Remove comments
        for desc in ('DISCTOTAL', 'TOTALDISCS', 'TRACKTOTAL', 'TOTALTRACKS',
                     'BARCODE', 'UPC', 'ISRC'):
            audio.tags.delall(f'TXXX:{desc}')

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


def _count_audio_folders(root_dir: Path, skip_set: set[str]) -> int:
    """Quick pre-scan to count folders containing audio files."""
    count = 0
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirpath = Path(dirpath)
        name = dirpath.name
        if dirpath != root_dir and name.startswith('.'):
            continue
        if name in skip_set:
            dirnames.clear()
            continue
        if any(Path(f).suffix.lower() in HANDLERS for f in filenames):
            count += 1
    return count


def process_directory(root_dir: Path, dry_run: bool, skip_folders: list[str] | None = None,
                      progress=None) -> dict:
    """Walk directory and update all audio files."""
    stats = {'processed': 0, 'skipped': 0, 'errors': 0}
    skip_set = set(skip_folders) if skip_folders else set()

    if progress:
        total = _count_audio_folders(root_dir, skip_set)
        progress.start(total, phase="tags")

    folders_done = 0
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirpath = Path(dirpath)
        folder_name = dirpath.name

        # Skip hidden directories. The root itself IS processed: loose audio
        # sitting directly in a flat legacy year folder (e.g. Singles/2015/)
        # gets tagged with album "Singles - 2015" via parse_folder_name's
        # fallback, same as any other folder.
        if dirpath != root_dir and folder_name.startswith('.'):
            continue

        # Skip folders matching any skip pattern
        if folder_name in skip_set:
            print(f"\n[{folder_name}] SKIPPED")
            dirnames.clear()
            continue

        audio_files = [dirpath / f for f in filenames if Path(f).suffix.lower() in HANDLERS]

        if not audio_files:
            continue

        # Sort by file creation time for track numbering
        audio_files.sort(key=lambda f: f.stat().st_birthtime, reverse=True)

        # Convert folder name to "Singles - YEAR MONTH" format
        album_name = parse_folder_name(folder_name)

        print(f"\n[{folder_name}] -> \"{album_name}\" ({len(audio_files)} files)")

        if progress:
            progress.update(folder_name, folders_done, 0, len(audio_files))

        for track_num, filepath in enumerate(audio_files, start=1):
            handler = HANDLERS.get(filepath.suffix.lower())

            if handler:
                action = "Would set" if dry_run else "Setting"
                print(f"  {action} #{track_num}: {filepath.name[:60]}...")

                if handler(filepath, album_name, track_num, dry_run):
                    stats['processed'] += 1
                else:
                    stats['errors'] += 1
                if progress:
                    progress.update(folder_name, folders_done, track_num, len(audio_files))
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

    # Sort by file creation time for track numbering
    audio_files.sort(key=lambda f: f.stat().st_birthtime, reverse=True)

    album_name = parse_folder_name(folder_name)
    print(f"\n[{folder_name}] -> \"{album_name}\" ({len(audio_files)} files)")

    for track_num, filepath in enumerate(audio_files, start=1):
        handler = HANDLERS.get(filepath.suffix.lower())
        if handler:
            action = "Would set" if dry_run else "Setting"
            print(f"  {action} #{track_num}: {filepath.name[:60]}...")
            if handler(filepath, album_name, track_num, dry_run):
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
