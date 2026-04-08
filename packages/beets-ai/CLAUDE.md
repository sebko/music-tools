# beets-ai

Python workspace and Claude Code integration for managing the beets music library.

## Environment

- **Binary**: `~/.local/bin/beet` (installed via pipx)
- **Config**: `~/.config/beets/config.yaml`
- **Library DB**: `~/.config/beets/library.db`
- **pipx venv**: `~/.local/pipx/venvs/beets`
- **Python**: 3.13.7 (in pipx venv)
- **Local venv**: `.venv/` (for scripts in this package)

## Plugin Installation

Beets is managed by pipx. To install plugins or dependencies:

```bash
pipx inject beets <package-name>
```

Do NOT use `pip install` — that installs to the system Python, not the beets venv.

## Key Commands

```bash
beet ls [QUERY]           # List items matching a query
beet info [QUERY]         # Show detailed metadata
beet import [PATH]        # Import music into the library
beet modify [QUERY] K=V   # Modify metadata fields
beet move [QUERY]         # Move files based on path format
beet rm [QUERY]           # Remove items from library
beet stats               # Show library statistics
beet config              # Show current configuration
beet config -p           # Show config file path
beet duplicates          # Find duplicate tracks
beet fields              # List available metadata fields
```

## Query Syntax

```
artist:NAME              # Match artist
album:NAME               # Match album
title:NAME               # Match track title
path:/some/path          # Match file path
singleton:true           # Match non-album tracks (singles)
genre:NAME               # Match genre
year:YYYY                # Match year
added:-1w..              # Added in the last week
```

Combine with spaces for implicit AND. Use `^` prefix to negate: `^artist:Beatles`.

## Current Config

**Plugins**: musicbrainz, fetchart, lastgenre, duplicates, scrub, zero, edit

**Import settings**: copy (not move), write tags, incremental, timid mode

**Path formats**:
- Default: `$albumartist/$album%aunique{}/$track $title`
- Singles: `Singles/$artist - $title`
- Compilations: `Compilations/$album%aunique{}/$track $title`

## Safety Guidelines

- Before running destructive commands (`rm`, `modify`), preview what will be affected first using `beet ls`
- Use `-p` flag to preview file paths when relevant
- When installing plugins, check if they're already installed first
- If a command fails, read the error — common issues are missing plugins, wrong query syntax, or path problems

## Python Workspace

This package includes a Python venv for beets scripting:

```bash
bash setup.sh              # Create venv and install deps
source .venv/bin/activate  # Activate venv
```

The venv includes beets as a library, so scripts can use the beets Python API directly for advanced operations beyond the CLI.
