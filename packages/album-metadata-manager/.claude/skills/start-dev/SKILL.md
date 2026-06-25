---
name: start-dev
description: "album-metadata-manager: Start backend and frontend dev servers in a detached tmux session"
---

Start both album-metadata-manager dev servers inside a **detached tmux session** so they
run independently of this Claude session, are not tracked as background tasks
(they never show up in the `←←` agent view), and write their logs to fixed
files that any Claude session can read on demand.

This command serves **whichever checkout you run it from** — the main repo or
any git worktree. It resolves the target directory dynamically with
`git rev-parse --show-toplevel`, so running it inside a worktree serves that
worktree. Because the session name, ports, and log files are fixed (a single
shared instance), each run first tears down the previous server and takes over.
Run it in the worktree you want to preview; `localhost:5173` always points at
whichever checkout you last started.

- tmux session: `mt-dev` (window `backend`, window `frontend`)
- Backend: port 3001, logs → `/tmp/mt-backend.log`
- Frontend: port 5173, logs → `/tmp/mt-frontend.log`

> Each ```bash block runs in its own shell, so env vars do NOT persist between
> blocks. The working directory DOES persist, so every block that needs the
> repo root recomputes `ROOT=$(git rev-parse --show-toplevel)` itself.

## Steps

1. Tear down any previous run (session + stale port holders):
   ```bash
   tmux kill-session -t mt-dev 2>/dev/null || true
   lsof -ti:3001 | xargs kill -9 2>/dev/null || true
   lsof -ti:5173 | xargs kill -9 2>/dev/null || true
   ```

2. Preflight the target checkout — a fresh worktree starts with no
   `node_modules`, no generated Prisma client, no `.env` files, and no built
   component-library `dist` (the frontend imports the built `dist`, not the
   library source). This step makes a cold worktree fully runnable: install all
   workspace deps, generate the Prisma client, bootstrap the gitignored env
   files from the main checkout, and rebuild the library:
   ```bash
   ROOT=$(git rev-parse --show-toplevel)
   echo "Serving album-metadata-manager from: $ROOT"

   # (a) Always install — idempotent and fast when warm. No `[ -d node_modules ]`
   #     guard, so partial-install states get repaired and ALL workspace packages
   #     (incl. backend nodemon) are present. Also triggers the backend
   #     `postinstall: prisma generate`.
   pnpm install --dir "$ROOT"

   # (b) Belt-and-suspenders: ensure the Prisma client exists even if a workspace
   #     postinstall was skipped. Idempotent and fast. Must run FROM the backend
   #     dir — `prisma generate` resolves the schema from the cwd, and `npm
   #     --prefix` only changes where the package is resolved, not the cwd, so it
   #     would look in the repo root and fail to find prisma/schema.prisma.
   (cd "$ROOT/packages/album-metadata-manager/backend" && npx prisma generate)

   # (c) Bootstrap gitignored env files into a worktree by copying from the main
   #     checkout (DATABASE_URL is an absolute path, safe on this one machine).
   #     Only copies when missing; no-op when run from the main checkout itself.
   MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$MAIN" != "$ROOT" ]; then
     for f in .env .env.test; do
       SRC="$MAIN/packages/album-metadata-manager/backend/$f"
       DST="$ROOT/packages/album-metadata-manager/backend/$f"
       [ -f "$SRC" ] && [ ! -f "$DST" ] && cp "$SRC" "$DST" && echo "bootstrapped backend $f"
     done
   fi

   # (d) Always rebuild the library so a just-edited component is picked up.
   npm --prefix "$ROOT/packages/my-component-library" run build
   ```
   On the main checkout this is near-instant (deps already present, env files in
   place, ~1.5s library build). On a cold worktree the first run also pays a
   one-time `pnpm install` + `prisma generate` and copies the env files across.

3. Start the detached session with the backend window. `tee` keeps the live
   output visible if the user runs `tmux attach -t mt-dev`, while also capturing
   it to the log file:
   ```bash
   ROOT=$(git rev-parse --show-toplevel)
   tmux new-session -d -s mt-dev -n backend -c "$ROOT/packages/album-metadata-manager/backend"
   tmux send-keys -t mt-dev:backend 'npm run dev 2>&1 | tee /tmp/mt-backend.log' Enter
   ```

4. Add the frontend window (enforce port 5173, fail loudly if taken):
   ```bash
   ROOT=$(git rev-parse --show-toplevel)
   tmux new-window -t mt-dev -n frontend -c "$ROOT/packages/album-metadata-manager/frontend"
   tmux send-keys -t mt-dev:frontend 'npm run dev -- --port 5173 --strictPort 2>&1 | tee /tmp/mt-frontend.log' Enter
   ```

   These `tmux` commands return immediately (the session is detached), so do NOT
   run them as background tasks — they are normal, instant commands.

5. Wait ~5 seconds, then health-check by reading the log files (NOT the ports —
   read what the servers actually printed):
   ```bash
   sleep 5
   grep -iE "running on port|Error|EADDRINUSE" /tmp/mt-backend.log | tail -5
   grep -iE "Local:|ready in|error|strictPort" /tmp/mt-frontend.log | tail -5
   ```
   The backend prints `🎵 Music Tagger API server running on port <PORT>`; the
   frontend (Vite) prints a `Local: http://localhost:5173/` line. Report the port
   each actually bound to from the log line, not an assumed value.

6. Report which servers came up and which failed, and which checkout is being
   served (the `ROOT` printed in step 2). Tell the user:
   - Attach to watch live: `tmux attach -t mt-dev` (detach with `Ctrl-b d`)
   - Stop everything: `tmux kill-session -t mt-dev`

## Reading logs on demand

When the user hits a runtime error and asks "what did the backend logs say",
do NOT stream the logs continuously. Just read the file at that moment:
```bash
tail -100 /tmp/mt-backend.log
# or target the error:
grep -iE "error|exception|stack|fail" /tmp/mt-backend.log | tail -40
```
Because the logs live in fixed files written by an external tmux session, any
number of concurrent Claude sessions can read the same logs independently.
