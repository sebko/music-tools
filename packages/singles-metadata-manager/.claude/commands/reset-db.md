---
description: Reset beets library DB and state.pickle for a clean re-import
---

Reset the beets library database and incremental-import state so the next wizard Import starts from scratch.

## Steps

1. Ensure the backend is running on port 3002:
   ```bash
   lsof -ti:3002 >/dev/null 2>&1 || echo "Backend not running on 3002 — start it first with /start-dev"
   ```

2. Call the reset endpoint:
   ```bash
   curl -sS -X POST http://localhost:3002/api/beets/library/reset -H "Content-Type: application/json" -d '{"confirm":true}'
   ```

3. Verify both `library.db` and `state.pickle` are gone:
   ```bash
   ls ~/.config/beets/
   ```
   Expected: only `config.yaml` remains.

4. Report success or failure.
