---
description: Start music-tagger backend and frontend dev servers
---

Start both development servers for the music-tagger application.

## Steps

1. Kill any existing processes on ports 3001 and 5173:
   ```bash
   lsof -ti:3001 | xargs kill -9 2>/dev/null || true
   lsof -ti:5173 | xargs kill -9 2>/dev/null || true
   ```

2. Start the backend server in the background:
   ```bash
   cd ${CLAUDE_SKILL_DIR}/../.. && cd backend && npm run dev
   ```

3. Start the frontend server in the background:
   ```bash
   cd ${CLAUDE_SKILL_DIR}/../.. && cd frontend && npm run dev
   ```

4. Wait 3 seconds, then verify both servers are running by checking ports 3001 and 5173 with `lsof`.

5. Report which servers are running and which failed.
