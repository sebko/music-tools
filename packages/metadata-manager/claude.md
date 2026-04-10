Beets Music Management: Implementation Plan

1. High-Level Objective
   The goal is to manage a DJ singles library on an external volume (/Volumes/T7/DJ Library/Singles) using beets. The library must be organized chronologically based on the date the file was added to the collection. The file structure is the primary record of history, ensuring the system remains "portable" even if the beets database is lost.

Core Folder Structure
DJ Library/Singles/YYYY/YYYY-MM MonthName/Artist - Title.mp3
Example: DJ Library/Singles/2026/2026-04 April/Aphex Twin - Alberto Balsalm.mp3

2. Global Configuration (config.yaml)
   Claude, ensure the config.yaml is initialized with these specific settings. We treat everything as a singleton to maintain a flat, track-based DJ library.

YAML
directory: /Volumes/T7/DJ Library/Singles
library: /Volumes/T7/DJ Library/beets_library.db

plugins: mtime inline info edit

# CRITICAL: Preserve historical 'Date Added' from file system metadata

mtime:
operation: added

# Path logic for both albums and singletons to ensure chronological folders

paths:
default: %time{$added, %Y}/%time{$added, %Y-%m %B}/$artist - $title
    singleton: %time{$added, %Y}/%time{$added, %Y-%m %B}/$artist - $title

import:
write: yes
move: yes # Default for Phase 2
copy: no
incremental: yes
autotag: yes 3. Phase 1: The "Discovery Sync" (Initial Import)
Goal: Index the existing library into the database without moving files or modifying metadata. This must be done once.

Instructions:
Do not use the default beet import.

Use CLI flags to override the config’s move and autotag settings.

Command:

Bash
beet import -s -A -M -C "/Volumes/T7/DJ Library/Singles"
-s: Singleton mode.

-A: As-Is (No MusicBrainz matching).

-M -C: No Move/Copy (Keep files in their current location).

Note: The mtime plugin will automatically populate the $added field in the database based on the file's actual creation date on the SSD.

4. Phase 2: The "Managed Workflow" (Ongoing Import)
   Goal: Process new music from an "Inbox" folder, match it against MusicBrainz, and move it into the permanent chronological library.

Instructions:
Identify the Inbox directory (default: ~/Downloads/Inbox).

Run the standard import.

Command:

Bash
beet import -s "~/Downloads/Inbox"
Verification: Before finishing, run a "Pretend" import to show the user the proposed path:

Bash
beet import -s -p "~/Downloads/Inbox" 5. Maintenance & Safety Rules
No Album Logic: Never import without the -s flag unless explicitly requested.

Database Search: Use beet ls added:2026-01 to verify files are being indexed with the correct date metadata.

Space Handling: Always escape the space in /DJ Library/ when executing shell commands.

System Rebuild: If the user ever moves to a new machine, they must install the mtime plugin before re-importing to ensure the folder structure (and $added dates) stay consistent.

Why this works for Sebastian (DJ Melquíades):
This plan ensures that Phase 1 respects the years of manual organization already on the T7 drive, while Phase 2 automates the future. By baking the $added date into the physical folder name, the DJ library remains readable by any software (Rekordbox, Serato, etc.) even without Beets.
