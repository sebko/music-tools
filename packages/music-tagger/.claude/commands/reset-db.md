---
description: Reset database by deleting all records (music files are safe) (project)
---

# reset-db

Wipe all database records while keeping your actual music files completely safe.

## Examples

- `/reset-db` - Delete all database records and start fresh

## Description

This command runs `prisma migrate reset` which:

- Drops all data from all tables automatically
- Recreates the schema from migrations
- Handles any new tables added to the schema (no manual updates needed)
- **Does NOT touch any actual music files** (100% safe)

This is useful when you want to:

- Start with a clean database
- Re-import your library from scratch

## Implementation

When executed, Claude will perform the following steps:

### Step 1: Navigate to backend directory

Claude will ensure it's in the correct directory:

```bash
cd /Users/sebastiankey/github/music-tagger/backend
```

### Step 2: Run the database reset script

Claude will execute the reset script:

```bash
!node reset-database.js
```

### Step 3: Show results

Claude will display the output showing:

- Prisma migrate reset progress
- Confirmation that database was reset successfully
- Confirmation that music files are safe

### Step 4: Provide next steps

Claude will remind you:

```
✅ Database wiped successfully!

Next steps:
1. Run a library scan to re-import albums: Open http://localhost:5173 and click "File Scan"
2. Or use the API: POST http://localhost:3001/api/library/scan

Your music files are untouched and safe.
```

## Safety

This command is completely safe:

- ✅ Only deletes database records (in SQLite)
- ✅ Never touches actual music files
- ✅ Never modifies ID3 tags
- ✅ Never deletes folders
- ✅ Reversible (just re-scan your library)

## Error Handling

If the script fails, Claude will:

- Show the error message
- Suggest troubleshooting steps (check if backend is running, check database connection)
- Remind you that no files were touched even if it failed

## Usage Notes

- Works from any directory (automatically navigates to backend)
- Takes only a few seconds to complete
- Does not require servers to be stopped
- Safe to run multiple times
