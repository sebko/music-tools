#!/usr/bin/env python3
"""
Watch a Singles directory and automatically process new/changed audio files.

Uses macOS FSEvents (via watchdog) to detect file changes, debounces per-folder,
then runs tag updates and album art generation on the affected folder only.
"""

import sys
import argparse
import threading
import traceback
from datetime import datetime
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from set_album_tags import process_single_folder as set_tags
from set_album_tags import HANDLERS as TAG_HANDLERS
from generate_album_art import process_single_folder as generate_art
from generate_album_art import HANDLERS as ART_HANDLERS

AUDIO_EXTENSIONS = set(TAG_HANDLERS.keys()) | set(ART_HANDLERS.keys())


def log(msg: str):
    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"[{timestamp}] {msg}", flush=True)


class SinglesFolderHandler(FileSystemEventHandler):
    def __init__(self, root_dir: Path, debounce_seconds: float = 5.0, dry_run: bool = False):
        super().__init__()
        self.root_dir = root_dir
        self.debounce_seconds = debounce_seconds
        self.dry_run = dry_run
        self._pending: dict[Path, threading.Timer] = {}
        self._lock = threading.Lock()

    def _get_target_folder(self, path: str) -> Path | None:
        """Return the immediate child folder of root_dir that contains this path, or None."""
        file_path = Path(path)

        # Must be a file with an audio extension
        if file_path.suffix.lower() not in AUDIO_EXTENSIONS:
            return None

        # Skip hidden files
        if file_path.name.startswith('.'):
            return None

        # The parent must be an immediate child of root_dir
        parent = file_path.parent
        if parent == self.root_dir:
            return None  # File directly in root, not in a subfolder
        if parent.parent != self.root_dir:
            return None  # Nested too deep

        # Skip hidden folders
        if parent.name.startswith('.'):
            return None

        return parent

    def _handle_event(self, event):
        if event.is_directory:
            return

        folder = self._get_target_folder(event.src_path)
        if folder is None:
            return

        log(f"Detected: {Path(event.src_path).name} in {folder.name}")

        with self._lock:
            if folder in self._pending:
                self._pending[folder].cancel()

            timer = threading.Timer(self.debounce_seconds, self._process_folder, args=[folder])
            timer.daemon = True
            self._pending[folder] = timer
            timer.start()

    def on_created(self, event):
        self._handle_event(event)

    def on_modified(self, event):
        self._handle_event(event)

    def on_moved(self, event):
        self._handle_event(event)

    def _process_folder(self, folder_path: Path):
        with self._lock:
            self._pending.pop(folder_path, None)

        mode = "DRY RUN" if self.dry_run else "LIVE"
        log(f"Processing {folder_path.name} ({mode})...")

        try:
            tag_stats = set_tags(folder_path, self.dry_run)
            log(f"Tags: {tag_stats['processed']} processed, {tag_stats['errors']} errors")
        except Exception:
            log(f"Error setting tags for {folder_path.name}:")
            traceback.print_exc()

        try:
            art_stats = generate_art(folder_path, self.dry_run)
            log(f"Art: {art_stats['processed']} processed, {art_stats['errors']} errors")
        except Exception:
            log(f"Error generating art for {folder_path.name}:")
            traceback.print_exc()

        log(f"Done with {folder_path.name}, watching...")


def main():
    parser = argparse.ArgumentParser(
        description='Watch Singles directory and auto-process new audio files'
    )
    parser.add_argument(
        'directory',
        help='Root directory to watch (e.g. Singles/)'
    )
    parser.add_argument(
        '--debounce', '-d',
        type=float,
        default=5.0,
        help='Seconds to wait after last file change before processing (default: 5)'
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
    log(f"Watching: {root_dir}")
    log(f"Mode: {mode}")
    log(f"Debounce: {args.debounce}s")
    log(f"Press Ctrl+C to stop")

    handler = SinglesFolderHandler(root_dir, args.debounce, args.dry_run)
    observer = Observer()
    observer.schedule(handler, str(root_dir), recursive=True)
    observer.start()

    try:
        while observer.is_alive():
            observer.join(1)
    except KeyboardInterrupt:
        log("Stopping...")
        observer.stop()

    observer.join()
    log("Stopped.")


if __name__ == '__main__':
    main()
