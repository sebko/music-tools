---
name: beets-status
description: "singles-metadata-manager: Check beets installation health, plugins, and library stats"
---

Run a diagnostic check on the beets music library installation.

## Steps

1. Check beets version and loaded plugins:
   ```bash
   beet version
   ```

2. Show the config file path and current configuration:
   ```bash
   beet config -p
   beet config
   ```

3. Show library statistics:
   ```bash
   beet stats
   ```

4. Report any issues found (missing plugins, config errors, empty library).
