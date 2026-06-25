---
description: Start singles-metadata-manager backend and frontend dev servers in a detached tmux session
---

Start both singles-metadata-manager dev servers inside a **detached tmux session** so they
run independently of this Claude session, are not tracked as background tasks
(they never show up in the `←←` agent view), and write their logs to fixed
files that any Claude session can read on demand.

- tmux session: `mm-dev` (window `backend`, window `frontend`)
- Backend: port 3002, logs → `/tmp/mm-backend.log`
- Frontend: port 5174, logs → `/tmp/mm-frontend.log`

## Steps

1. Tear down any previous run (session + stale port holders):
   ```bash
   tmux kill-session -t mm-dev 2>/dev/null || true
   lsof -ti:3002 | xargs kill -9 2>/dev/null || true
   lsof -ti:5174 | xargs kill -9 2>/dev/null || true
   ```

2. Start the detached session with the backend window. `tee` keeps the live
   output visible if the user runs `tmux attach -t mm-dev`, while also capturing
   it to the log file.

   **Node version matters:** the native module `better-sqlite3` is compiled
   against the version pinned in `.nvmrc` (`lts-krypton` / Node 24). The window
   must run that version or the backend crashes on every DB call with
   `NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED`. tmux's `-c` sets the cwd via
   `chdir()`, which does **not** fire fnm's `use-on-cd` hook, and the
   `backend`/`frontend` subdirs have no `.nvmrc` of their own. So start the
   window in the **package root** (which has `.nvmrc`), run `fnm use` to resolve
   it (no hardcoded version — reads `.nvmrc`), then `cd` into the subdir
   (fnm keeps the resolved version when a dir has no `.nvmrc`):
   ```bash
   tmux new-session -d -s mm-dev -n backend -c /Users/sebastiankey/github/music-tools/packages/singles-metadata-manager
   tmux send-keys -t mm-dev:backend 'fnm use; cd backend; node -v; npm run dev 2>&1 | tee /tmp/mm-backend.log' Enter
   ```

3. Add the frontend window (enforce port 5174, fail loudly if taken). Same
   package-root start + `fnm use` + `cd` pattern as the backend:
   ```bash
   tmux new-window -t mm-dev -n frontend -c /Users/sebastiankey/github/music-tools/packages/singles-metadata-manager
   tmux send-keys -t mm-dev:frontend 'fnm use; cd frontend; node -v; npm run dev -- --port 5174 --strictPort 2>&1 | tee /tmp/mm-frontend.log' Enter
   ```

   These `tmux` commands return immediately (the session is detached), so do NOT
   run them as background tasks — they are normal, instant commands.

4. Wait ~5 seconds, then health-check by reading the log files (NOT the ports —
   read what the servers actually printed):
   ```bash
   sleep 5
   grep -iE "running on|Error|EADDRINUSE" /tmp/mm-backend.log | tail -5
   grep -iE "Local:|ready in|error|strictPort" /tmp/mm-frontend.log | tail -5
   ```
   The backend prints `Metadata Manager backend running on http://localhost:<PORT>`;
   the frontend (Vite) prints a `Local: http://localhost:5174/` line. Report the
   port each actually bound to from the log line, not an assumed value.

5. Report which servers came up and which failed. Tell the user:
   - Attach to watch live: `tmux attach -t mm-dev` (detach with `Ctrl-b d`)
   - Stop everything: `tmux kill-session -t mm-dev`

## Reading logs on demand

When the user hits a runtime error and asks "what did the backend logs say",
do NOT stream the logs continuously. Just read the file at that moment:
```bash
tail -100 /tmp/mm-backend.log
# or target the error:
grep -iE "error|exception|stack|fail" /tmp/mm-backend.log | tail -40
```
Because the logs live in fixed files written by an external tmux session, any
number of concurrent Claude sessions can read the same logs independently.
