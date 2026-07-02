---
name: start-dev
description: "singles-metadata-manager: Start backend and frontend dev servers in a detached tmux session (per-worktree isolated instance)"
---

Start both singles-metadata-manager dev servers inside a **detached tmux session** so they
run independently of this Claude session, are not tracked as background tasks
(they never show up in the `←←` agent view), and write their logs to fixed
files that any Claude session can read on demand.

This command serves **whichever checkout you run it from** — the main repo or
any git worktree — and gives each checkout its **own isolated instance** so
starting a worktree never disturbs the main server (or another worktree):

- **Main checkout** → the canonical instance: session `smm-dev`, backend `3002`,
  frontend `5174`, logs `/tmp/smm-backend.log` + `/tmp/smm-frontend.log`. Running
  it here tears down and takes over `3002`/`5174` as before.
- **A worktree** → its own instance keyed by the worktree directory name:
  session `smm-dev-<slug>`, ports **deterministically derived** from the slug
  (backend `3002+offset`, frontend `5174+offset`), logs `/tmp/smm-<slug>-*.log`.
  A worktree run **only ever touches its own session/ports — never `3002`/`5174`** —
  so the main server is left alone. Re-running in the same worktree reuses the
  same ports and just restarts that instance.

Because each checkout's identity (slug, ports, session, log paths) is a pure,
deterministic function of the checkout, every step below resolves it the same
way. Step 1 writes that resolver to `/tmp/smm-dev-resolve.sh`; **every later
bash block sources it** to recover the same values (env vars do NOT persist
between blocks; the working directory does).

> Each ```bash block runs in its own shell, so env vars do NOT persist between
> blocks. The working directory DOES persist. Blocks `source
> /tmp/smm-dev-resolve.sh` to recompute `ROOT`, `SLUG`, `BACKEND_PORT`,
> `FRONTEND_PORT`, `SESSION`, `BACK_LOG`, `FRONT_LOG` from the current checkout.

**Node version matters throughout:** the native module `better-sqlite3` is
compiled against the version pinned in `.nvmrc` (`lts-krypton` / Node 24). Both
the preflight install (which compiles it) and the tmux windows (which run it)
must use that version or the backend crashes on every DB call with
`NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED`. The repo root and package root both
carry `.nvmrc`; the `backend`/`frontend` subdirs do not. So every step that runs
node/npm/pnpm first `cd`s to a dir with `.nvmrc` and runs `fnm use` to resolve it
(no hardcoded version — reads `.nvmrc`).

## Steps

1. Resolve this checkout's instance identity, then tear down **only that
   instance** (its session + its own ports — a worktree run never kills
   `3002`/`5174`):
   ```bash
   cat > /tmp/smm-dev-resolve.sh <<'RESOLVE'
   # Derive this checkout's dev-server identity. Pure + deterministic, so
   # sourcing it from any step yields identical values (no state to persist).
   ROOT=$(git rev-parse --show-toplevel)
   MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   if [ "$ROOT" = "$MAIN" ]; then
     # Main checkout keeps the canonical, well-known instance.
     SLUG=main
     BACKEND_PORT=3002
     FRONTEND_PORT=5174
     SESSION=smm-dev
     BACK_LOG=/tmp/smm-backend.log
     FRONT_LOG=/tmp/smm-frontend.log
   else
     # Each worktree gets its own instance on deterministically-derived ports,
     # so it never collides with — or kills — the main server. cksum(slug)
     # gives a stable offset, so the same worktree always lands on the same
     # ports (re-runs reuse them). offset >= 1 => worktree ports are always
     # above 3002/5174, never equal to the canonical pair.
     SLUG=$(basename "$ROOT" | tr -c 'a-zA-Z0-9' '-' | sed -E 's/-+/-/g; s/^-|-$//g')
     OFFSET=$(( $(printf '%s' "$SLUG" | cksum | cut -d' ' -f1) % 240 + 1 ))
     BACKEND_PORT=$(( 3002 + OFFSET ))
     FRONTEND_PORT=$(( 5174 + OFFSET ))
     SESSION="smm-dev-$SLUG"
     BACK_LOG="/tmp/smm-$SLUG-backend.log"
     FRONT_LOG="/tmp/smm-$SLUG-frontend.log"
   fi
   RESOLVE
   source /tmp/smm-dev-resolve.sh
   echo "Instance: SLUG=$SLUG SESSION=$SESSION backend=$BACKEND_PORT frontend=$FRONTEND_PORT"

   # Tear down ONLY this instance. Killing the tmux session frees the ports its
   # processes held; the lsof kills mop up any orphaned holder of THIS
   # instance's ports. For the main checkout these are 3002/5174 (canonical
   # takeover); for a worktree they are its derived ports — 3002/5174 are never
   # touched from a worktree run.
   tmux kill-session -t "$SESSION" 2>/dev/null || true
   lsof -ti:"$BACKEND_PORT"  | xargs kill -9 2>/dev/null || true
   lsof -ti:"$FRONTEND_PORT" | xargs kill -9 2>/dev/null || true
   ```

2. Preflight the target checkout — a fresh worktree starts with no
   `node_modules`, no generated Prisma client, no `.env` files, an **empty,
   un-migrated database**, and no built component-library `dist` (the frontend
   imports the built `dist`, not the library source). This step makes a cold
   worktree fully runnable: pin Node 24, install deps (compiling
   `better-sqlite3` against Node 24), generate the Prisma client, bootstrap the
   gitignored env files, point this instance's backend at its own port, apply
   migrations, and rebuild the library:
   ```bash
   source /tmp/smm-dev-resolve.sh
   echo "Serving singles-metadata-manager from: $ROOT"

   # (a) Pin Node 24 for every command in this block. cd to the repo root (it
   #     carries .nvmrc), initialise fnm for this non-interactive shell, and
   #     select the pinned version so the native better-sqlite3 build below is
   #     compiled against the SAME node the tmux windows will run.
   cd "$ROOT"
   command -v fnm >/dev/null 2>&1 && eval "$(fnm env)" && fnm use 2>/dev/null || true
   node -v

   # (b) Always install — idempotent and fast when warm. No `[ -d node_modules ]`
   #     guard, so partial-install states get repaired and ALL workspace packages
   #     are present. pnpm's allowBuilds compiles better-sqlite3/esbuild and runs
   #     prisma generate where configured.
   pnpm install --dir "$ROOT"

   # (c) Belt-and-suspenders: ensure the Prisma client exists (singles has no
   #     postinstall generate). Idempotent and fast. Must run FROM the backend
   #     dir — `prisma generate` resolves the schema from the cwd.
   (cd "$ROOT/packages/singles-metadata-manager/backend" && npx prisma generate)

   # (d) Bootstrap gitignored env files into a worktree by copying from the main
   #     checkout. NOTE: DATABASE_URL is a *relative* path
   #     (`file:./singles-metadata-manager.db`, resolved against backend/prisma/),
   #     so every worktree gets its OWN separate, initially-empty database — it
   #     does NOT share the main DB. That isolation is exactly why step (f) below
   #     must run migrations. Only copies when missing; no-op from the main
   #     checkout itself.
   if [ "$MAIN" != "$ROOT" ]; then
     for f in .env .env.test; do
       SRC="$MAIN/packages/singles-metadata-manager/backend/$f"
       DST="$ROOT/packages/singles-metadata-manager/backend/$f"
       [ -f "$SRC" ] && [ ! -f "$DST" ] && cp "$SRC" "$DST" && echo "bootstrapped backend $f"
     done
   fi

   # (e) Pin this instance's backend port in its own .env (worktrees only). The
   #     backend reads PORT via process.env.PORT and the Vite dev proxy reads the
   #     same PORT line from backend/.env (single source of truth), so this one
   #     line keeps both the server and its API proxy on the instance's port. The
   #     main checkout is left untouched (it already ships PORT=3002).
   if [ "$SLUG" != "main" ]; then
     ENV="$ROOT/packages/singles-metadata-manager/backend/.env"
     if grep -q '^PORT=' "$ENV" 2>/dev/null; then
       sed -i '' "s/^PORT=.*/PORT=$BACKEND_PORT/" "$ENV"
     else
       printf '\nPORT=%s\n' "$BACKEND_PORT" >> "$ENV"
     fi
     echo "pinned backend PORT=$BACKEND_PORT in worktree .env"
   fi

   # (f) Apply migrations to this checkout's database. On the main checkout this
   #     is a no-op (already migrated); on a fresh worktree it creates the schema
   #     in the otherwise-empty DB, without which the backend throws P2021
   #     table-not-found on every query. migrate deploy is forward-only and
   #     additive — it never drops data. The worktree DB stays EMPTY (schema
   #     only); populate it from the UI.
   (cd "$ROOT/packages/singles-metadata-manager/backend" && npx prisma migrate deploy)

   # (g) Always rebuild the library so a just-edited component is picked up.
   npm --prefix "$ROOT/packages/my-component-library" run build
   ```
   On the main checkout this is near-instant (deps present, env files in place,
   migrations applied). On a cold worktree the first run also pays a one-time
   `pnpm install` + `prisma generate`, copies the env files, pins the port, and
   creates the schema.

3. Start the detached session with the backend window. The window opens in the
   **package root** (which has `.nvmrc`), runs `fnm use` to resolve Node 24, then
   `cd`s into `backend` (fnm keeps the resolved version when a dir has no
   `.nvmrc`). The backend binds the `PORT` from its `.env` (set in step 2e).
   `tee` keeps the live output visible under `tmux attach` while capturing it to
   the log file:
   ```bash
   source /tmp/smm-dev-resolve.sh
   tmux new-session -d -s "$SESSION" -n backend -c "$ROOT/packages/singles-metadata-manager"
   # Brace the var: an unbraced "$SESSION:backend" is parsed as a parameter
   # modifier by some shells (zsh eats ":b"/":f"/":r" etc.), mangling the target.
   tmux send-keys -t "${SESSION}:backend" "fnm use; cd backend; node -v; npm run dev 2>&1 | tee $BACK_LOG" Enter
   ```

4. Add the frontend window (pin this instance's frontend port, fail loudly if
   taken). Same package-root start + `fnm use` + `cd` pattern as the backend:
   ```bash
   source /tmp/smm-dev-resolve.sh
   tmux new-window -t "$SESSION" -n frontend -c "$ROOT/packages/singles-metadata-manager"
   # Brace the var (see step 3): "$SESSION:frontend" would be mangled to
   # "$SESSIONontend" by shells that treat ":fr" as a parameter modifier.
   tmux send-keys -t "${SESSION}:frontend" "fnm use; cd frontend; node -v; npm run dev -- --port $FRONTEND_PORT --strictPort 2>&1 | tee $FRONT_LOG" Enter
   ```

   These `tmux` commands return immediately (the session is detached), so do NOT
   run them as background tasks — they are normal, instant commands.

5. Wait ~5 seconds, then health-check by reading this instance's log files (NOT
   the ports — read what the servers actually printed):
   ```bash
   source /tmp/smm-dev-resolve.sh
   sleep 5
   grep -iE "running on|Error|EADDRINUSE" "$BACK_LOG" | tail -5
   grep -iE "Local:|ready in|error|strictPort" "$FRONT_LOG" | tail -5
   ```
   The backend prints `Metadata Manager backend running on http://localhost:<PORT>`;
   the frontend (Vite) prints a `Local: http://localhost:<PORT>/` line. Report the
   port each actually bound to from the log line, not an assumed value.

6. Report which servers came up and which failed, the checkout being served
   (`ROOT`), and the instance's URL `http://localhost:$FRONTEND_PORT`. Tell the
   user:
   - Attach to watch live: `tmux attach -t <SESSION>` (detach with `Ctrl-b d`)
   - Stop this instance: `tmux kill-session -t <SESSION>`
   - List all running instances: see below.

## Listing running instances

Because each instance is its own `smm-dev[-<slug>]` session with its own log
files, you can enumerate everything that is up without disturbing it:
```bash
tmux ls 2>/dev/null | grep -E '^smm-dev'
# and the URL each frontend bound to:
for f in /tmp/smm-frontend.log /tmp/smm-*-frontend.log; do
  [ -f "$f" ] && printf '%s -> %s\n' "$f" "$(grep -oE 'http://localhost:[0-9]+' "$f" | tail -1)"
done
```

## Reading logs on demand

When the user hits a runtime error and asks "what did the backend logs say",
do NOT stream the logs continuously. Resolve the instance and read its file at
that moment:
```bash
source /tmp/smm-dev-resolve.sh
tail -100 "$BACK_LOG"
# or target the error:
grep -iE "error|exception|stack|fail" "$BACK_LOG" | tail -40
```
Because the logs live in fixed per-instance files written by an external tmux
session, any number of concurrent Claude sessions can read the same logs
independently.
