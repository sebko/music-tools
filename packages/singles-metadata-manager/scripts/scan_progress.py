"""Shared scan progress file for IPC between Python scripts and the menu bar app."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

PROGRESS_PATH = Path.home() / "Library" / "Logs" / "singles-watcher-progress.json"


class ScanProgress:
    def __init__(self, path: Path = PROGRESS_PATH):
        self.path = path
        self._state: dict = {}

    def start(self, total_folders: int, phase: str = "tags"):
        self._state = {
            "running": True,
            "phase": phase,
            "current_folder": "",
            "folders_done": 0,
            "total_folders": total_folders,
            "files_done": 0,
            "total_files": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write()

    def set_phase(self, phase: str):
        self._state["phase"] = phase
        self._state["folders_done"] = 0
        self._write()

    def update(self, folder: str, folders_done: int, files_done: int, total_files: int):
        self._state["current_folder"] = folder
        self._state["folders_done"] = folders_done
        self._state["files_done"] = files_done
        self._state["total_files"] = total_files
        self._write()

    def finish(self):
        self._state["running"] = False
        self._state["current_folder"] = ""
        self._write()

    def _write(self):
        # Atomic write: write to temp file, then rename
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(self._state, f)
            os.replace(tmp, self.path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
