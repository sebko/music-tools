#!/usr/bin/env python3
"""
Run both album tag updater and album art generator on a singles directory.
"""

import sys
import argparse
from pathlib import Path

from set_album_tags import process_directory as set_tags
from generate_album_art import process_directory as generate_art
from scan_progress import ScanProgress


def main():
    parser = argparse.ArgumentParser(
        description='Set album tags and generate album art for singles folders'
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
    parser.add_argument(
        '--skip', '-s',
        nargs='+',
        default=[],
        help='Folder names to skip (e.g. --skip 2024 2025)'
    )

    args = parser.parse_args()
    root_dir = Path(args.directory).resolve()

    if not root_dir.is_dir():
        print(f"Error: {root_dir} is not a directory")
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "LIVE"
    progress = ScanProgress()

    try:
        # Step 1: Set album tags
        print(f"=== Step 1: Album Tag Updater ({mode}) ===")
        print(f"Root: {root_dir}")
        if args.skip:
            print(f"Skipping folders: {', '.join(args.skip)}")
        tag_stats = set_tags(root_dir, args.dry_run, args.skip or None, progress=progress)

        print(f"\nTag results: {tag_stats['processed']} processed, "
              f"{tag_stats['errors']} errors, {tag_stats['skipped']} skipped")

        # Step 2: Generate and embed album art
        print(f"\n=== Step 2: Album Art Generator ({mode}) ===")
        print(f"Root: {root_dir}")
        art_stats = generate_art(root_dir, args.dry_run, args.skip or None, progress=progress)

        print(f"\nArt results: {art_stats['processed']} processed, "
              f"{art_stats['errors']} errors, {art_stats['skipped']} skipped")

        # Combined summary
        print(f"\n=== Combined Summary ===")
        print(f"Tags:    {tag_stats['processed']} processed, {tag_stats['errors']} errors")
        print(f"Artwork: {art_stats['processed']} processed, {art_stats['errors']} errors")

        if args.dry_run:
            print("\nThis was a dry run. Run without --dry-run to apply changes.")
    finally:
        progress.finish()


if __name__ == '__main__':
    main()
