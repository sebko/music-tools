---
name: start-dev
description: "album-metadata-manager: Start backend and frontend dev servers in a detached tmux session (per-worktree isolated instance)"
---

Start both album-metadata-manager dev servers inside a **detached tmux session** so they
run independently of this Claude session, are not tracked as background tasks
(they never show up in the `←←` agent view), and write their logs to fixed
files that any Claude session can read on demand.

This command serves **whichever checkout you run it from** — the main repo or
any git worktree — and gives each checkout its **own isolated instance** so
starting a worktree never disturbs the main server (or another worktree):

- **Main checkout** → the canonical instance: session `amm-dev`, backend `3001`,
  frontend `5173`, logs `/tmp/amm-backend.log` + `/tmp/amm-frontend.log`. Running
  it here tears down and takes over `3001`/`5173` as before.
- **A worktree** → its own instance keyed by the worktree directory name:
  session `amm-dev-<slug>`, ports **deterministically derived** from the slug
  (backend `3001+offset`, frontend `5173+offset`), logs `/tmp/amm-<slug>-*.log`.
  A worktree run **only ever touches its own session/ports — never `3001`/`5173`** —
  so the main server (and any scan it is running) is left alone. Re-running in
  the same worktree reuses the same ports and just restarts that instance.

Because each checkout's identity (slug, ports, session, log paths) is a pure,
deterministic function of the checkout, every step below resolves it the same
way. Step 1 writes that resolver to `/tmp/amm-dev-resolve.sh`; **every later
bash block sources it** to recover the same values (env vars do NOT persist
between blocks; the working directory does).

> Each ```bash block runs in its own shell, so env vars do NOT persist between
> blocks. The working directory DOES persist. Blocks `source
> /tmp/amm-dev-resolve.sh` to recompute `ROOT`, `SLUG`, `BACKEND_PORT`,
> `FRONTEND_PORT`, `SESSION`, `BACK_LOG`, `FRONT_LOG` from the current checkout.

## Steps

1. Resolve this checkout's instance identity, then tear down **only that
   instance** (its session + its own ports — a worktree run never kills
   `3001`/`5173`):
   ```bash
   cat > /tmp/amm-dev-resolve.sh <<'RESOLVE'
   # Derive this checkout's dev-server identity. Pure + deterministic, so
   # sourcing it from any step yields identical values (no state to persist).
   ROOT=$(git rev-parse --show-toplevel)
   MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$ROOT" = "$MAIN" ]; then
     # Main checkout keeps the canonical, well-known instance.
     SLUG=main
     BACKEND_PORT=3001
     FRONTEND_PORT=5173
     SESSION=amm-dev
     BACK_LOG=/tmp/amm-backend.log
     FRONT_LOG=/tmp/amm-frontend.log
   else
     # Each worktree gets its own instance on deterministically-derived ports,
     # so it never collides with — or kills — the main server. cksum(slug)
     # gives a stable offset, so the same worktree always lands on the same
     # ports (re-runs reuse them). offset >= 1 => worktree ports are always
     # above 3001/5173, never equal to the canonical pair.
     SLUG=$(basename "$ROOT" | tr -c 'a-zA-Z0-9' '-' | sed -E 's/-+/-/g; s/^-|-$//g')
     OFFSET=$(( $(printf '%s' "$SLUG" | cksum | cut -d' ' -f1) % 240 + 1 ))
     BACKEND_PORT=$(( 3001 + OFFSET ))
     FRONTEND_PORT=$(( 5173 + OFFSET ))
     SESSION="amm-dev-$SLUG"
     BACK_LOG="/tmp/amm-$SLUG-backend.log"
     FRONT_LOG="/tmp/amm-$SLUG-frontend.log"
   fi
   RESOLVE
   source /tmp/amm-dev-resolve.sh
   echo "Instance: SLUG=$SLUG SESSION=$SESSION backend=$BACKEND_PORT frontend=$FRONTEND_PORT"

   # Tear down ONLY this instance. Killing the tmux session frees the ports its
   # processes held; the lsof kills mop up any orphaned holder of THIS
   # instance's ports. For the main checkout these are 3001/5173 (canonical
   # takeover); for a worktree they are its derived ports — 3001/5173 are never
   # touched from a worktree run.
   tmux kill-session -t "$SESSION" 2>/dev/null || true
   lsof -ti:"$BACKEND_PORT"  | xargs kill -9 2>/dev/null || true
   lsof -ti:"$FRONTEND_PORT" | xargs kill -9 2>/dev/null || true
   ```

2. Preflight the target checkout — a fresh worktree starts with no
   `node_modules`, no generated Prisma client, no `.env` files, an **empty,
   un-migrated database**, and no built component-library `dist` (the frontend
   imports the built `dist`, not the library source). This step makes a cold
   worktree fully runnable: install deps, generate the Prisma client, bootstrap
   the gitignored env files, point this instance's backend at its own port,
   apply migrations, and rebuild the library:
   ```bash
   source /tmp/amm-dev-resolve.sh
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
   #     checkout. NOTE: DATABASE_URL is a *relative* path (`file:./music-library.db`,
   #     resolved against backend/prisma/), so every worktree gets its OWN
   #     separate, initially-empty database — it does NOT share the main DB.
   #     That isolation is exactly why step (e) below must run migrations.
   #     Only copies when missing; no-op when run from the main checkout itself.
   if [ "$MAIN" != "$ROOT" ]; then
     for f in .env .env.test; do
       SRC="$MAIN/packages/album-metadata-manager/backend/$f"
       DST="$ROOT/packages/album-metadata-manager/backend/$f"
       [ -f "$SRC" ] && [ ! -f "$DST" ] && cp "$SRC" "$DST" && echo "bootstrapped backend $f"
     done
   fi

   # (d) Pin this instance's backend port in its own .env (worktrees only). The
   #     backend reads PORT via dotenv(override:true) and the Vite dev proxy reads
   #     the same PORT line from backend/.env, so this single line keeps both the
   #     server and its API proxy on the instance's port. The main checkout is
   #     left untouched (it already ships PORT=3001).
   if [ "$SLUG" != "main" ]; then
     ENV="$ROOT/packages/album-metadata-manager/backend/.env"
     if grep -q '^PORT=' "$ENV" 2>/dev/null; then
       sed -i '' "s/^PORT=.*/PORT=$BACKEND_PORT/" "$ENV"
     else
       printf '\nPORT=%s\n' "$BACKEND_PORT" >> "$ENV"
     fi
     echo "pinned backend PORT=$BACKEND_PORT in worktree .env"
   fi

   # (e) Apply migrations to this checkout's database. On the main checkout this
   #     is a no-op (already migrated); on a fresh worktree it creates the schema
   #     in the otherwise-empty DB, without which the backend throws P2021
   #     table-not-found on every query. migrate deploy is forward-only and
   #     additive — it never drops data. The worktree DB stays EMPTY of albums
   #     (schema only); scan from the UI to populate it.
   (cd "$ROOT/packages/album-metadata-manager/backend" && npx prisma migrate deploy)

   # (f) Always rebuild the library so a just-edited component is picked up.
   npm --prefix "$ROOT/packages/my-component-library" run build
   ```
   On the main checkout this is near-instant (deps present, env files in place,
   migrations applied, ~1.5s library build). On a cold worktree the first run
   also pays a one-time `pnpm install` + `prisma generate`, copies the env files,
   pins the port, and creates the schema.

3. Start the detached session with the backend window. The backend binds the
   `PORT` from its `.env` (set in step 2d). `tee` keeps the live output visible
   if the user runs `tmux attach`, while also capturing it to the log file:
   ```bash
   source /tmp/amm-dev-resolve.sh
   tmux new-session -d -s "$SESSION" -n backend -c "$ROOT/packages/album-metadata-manager/backend"
   # Brace the var: an unbraced "$SESSION:backend" is parsed as a parameter
   # modifier by some shells (zsh eats ":b"/":f"/":r" etc.), mangling the target.
   tmux send-keys -t "${SESSION}:backend" "npm run dev 2>&1 | tee $BACK_LOG" Enter
   ```

4. Add the frontend window (pin this instance's frontend port, fail loudly if
   taken):
   ```bash
   source /tmp/amm-dev-resolve.sh
   tmux new-window -t "$SESSION" -n frontend -c "$ROOT/packages/album-metadata-manager/frontend"
   # Brace the var (see step 3): "$SESSION:frontend" would be mangled to
   # "$SESSIONontend" by shells that treat ":fr" as a parameter modifier.
   tmux send-keys -t "${SESSION}:frontend" "npm run dev -- --port $FRONTEND_PORT --strictPort 2>&1 | tee $FRONT_LOG" Enter
   ```

   These `tmux` commands return immediately (the session is detached), so do NOT
   run them as background tasks — they are normal, instant commands.

5. Wait ~5 seconds, then health-check by reading this instance's log files (NOT
   the ports — read what the servers actually printed):
   ```bash
   source /tmp/amm-dev-resolve.sh
   sleep 5
   grep -iE "running on port|Error|EADDRINUSE" "$BACK_LOG" | tail -5
   grep -iE "Local:|ready in|error|strictPort" "$FRONT_LOG" | tail -5
   ```
   The backend prints `🎵 Music Tagger API server running on port <PORT>`; the
   frontend (Vite) prints a `Local: http://localhost:<PORT>/` line. Report the
   port each actually bound to from the log line, not an assumed value.

6. Report which servers came up and which failed, the checkout being served
   (`ROOT`), and the instance's URL `http://localhost:$FRONTEND_PORT`. Tell the
   user:
   - Attach to watch live: `tmux attach -t <SESSION>` (detach with `Ctrl-b d`)
   - Stop this instance: `tmux kill-session -t <SESSION>`
   - List all running instances: see below.

## Listing running instances

Because each instance is its own `amm-dev[-<slug>]` session with its own log
files, you can enumerate everything that is up without disturbing it:
```bash
tmux ls 2>/dev/null | grep -E '^amm-dev'
# and the URL each frontend bound to:
for f in /tmp/amm-frontend.log /tmp/amm-*-frontend.log; do
  [ -f "$f" ] && printf '%s -> %s\n' "$f" "$(grep -oE 'http://localhost:[0-9]+' "$f" | tail -1)"
done
```

## Reading logs on demand

When the user hits a runtime error and asks "what did the backend logs say",
do NOT stream the logs continuously. Resolve the instance and read its file at
that moment:
```bash
source /tmp/amm-dev-resolve.sh
tail -100 "$BACK_LOG"
# or target the error:
grep -iE "error|exception|stack|fail" "$BACK_LOG" | tail -40
```
Because the logs live in fixed per-instance files written by an external tmux
session, any number of concurrent Claude sessions can read the same logs
independently.
