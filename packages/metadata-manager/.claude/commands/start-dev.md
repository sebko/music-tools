---
description: Start metadata-manager backend and frontend dev servers
---

Start both development servers for the metadata-manager application.

## Steps

1. Kill any existing processes on ports 3002 and 5174:
   ```bash
   lsof -ti:3002 | xargs kill -9 2>/dev/null || true
   lsof -ti:5174 | xargs kill -9 2>/dev/null || true
   ```

2. Start the backend server in the background:
   ```bash
   cd packages/metadata-manager/backend && npm run dev
   ```

3. Start the frontend server in the background:
   ```bash
   cd packages/metadata-manager/frontend && npm run dev
   ```

4. Wait 3 seconds, then verify both servers are running by checking ports 3002 and 5174 with `lsof`.

5. Report which servers are running and which failed.
