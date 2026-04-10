---
description: Start music-tagger backend and frontend dev servers
---

Start both development servers for the music-tagger application.

## Steps

1. Kill any existing dev processes for this project (pattern-matched, no hardcoded port numbers):
   ```bash
   pkill -f "nodemon.*music-tagger/backend" 2>/dev/null || true
   pkill -f "vite.*music-tagger/frontend" 2>/dev/null || true
   ```

2. Start the backend server in the background:
   ```bash
   cd packages/music-tagger/backend && npm run dev
   ```

3. Start the frontend server in the background:
   ```bash
   cd packages/music-tagger/frontend && npm run dev
   ```

4. Wait 3 seconds, then verify both processes are still running by reading the
   background task output for the "running on port" / "Local:" startup lines.
   Do NOT hardcode ports — read the actual log output the servers print.

5. Report which servers are running and which failed (and the port each
   actually bound to, taken from the log line — not assumed).
