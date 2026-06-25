# Album Metadata Manager

A local web app for cleaning up the metadata in a [Plex](https://www.plex.tv/) music
library. It scans your Plex albums into a local database, matches each album against
[Redacted](https://redacted.sh/) to pull accurate genres, year, label and high-res
artwork, and lets you review and sync the corrected metadata back to Plex and/or to the
underlying audio files.

Everything runs on your own machine — there's no hosted service and your library never
leaves your computer.

## What it does

- **Scan** your Plex music library into a local SQLite database.
- **Match** albums against Redacted with a confidence-scored, multi-strategy search
  (uses your snatched torrents, artist discography, and browse search).
- **Review** matches album-by-album, or run a bulk scan across the whole library.
- **Sync** corrected metadata back to Plex, or write it down into the audio files
  themselves (ID3 / Vorbis tags).
- **Artwork**: pull hi-res cover art from Redacted, or search external sources
  (MusicHoarders) and embed your own.
- **Wizards** for library housekeeping:
  - _Favourites_ — shortlist and copy out your favourite albums.
  - _Album Deleter_ — review and safely remove albums.
  - _Files → Plex_ — push file-based metadata up into Plex.
- **MusicBrainz** is used as a secondary lookup (no API key required).

## Requirements

- **Node.js** — version pinned in [`.nvmrc`](./.nvmrc) (`nvm use`)
- **pnpm** — this package is part of the music-tools pnpm monorepo
- A **Plex Media Server** with a music library
- A **Redacted** account + API key (for metadata/artwork lookups)

## Setup

Each step below says which directory to run it from. Steps 1 and 4 run from the
**repo root**; steps 2 and 3 run from this package's **`backend/`** directory.

### 1. Install and build the workspace

From the **repo root** (installs every package, generates the Prisma client, and
builds the shared component library this app's frontend imports):

```bash
pnpm install
pnpm build
```

> `pnpm build` is required once on a fresh clone. The frontend imports the shared
> `@music-tools/my-component-library` from its built `dist/`, which isn't checked
> in — without this step `pnpm dev:frontend` fails to resolve that import. After
> the first build, day-to-day you only run the `dev:*` scripts in step 4.

### 2. Configure the backend

From `packages/album-metadata-manager/backend`:

```bash
cp .env.template .env
```

Then edit `backend/.env` and set, at minimum:

- `MUSIC_LIBRARY_PATH` — folder containing your audio files (can be an external drive)
- `REDACTED_API_KEY` — Redacted ▸ User Settings ▸ Access Settings ▸ create an API key
- `REDACTED_USER_ID` — your Redacted user id (enables the "snatched torrents" search)

`.env` is gitignored — your keys stay local. See
[Configuration](#configuration) below for the full list.

### 3. Set up the database

Also from `packages/album-metadata-manager/backend`:

```bash
npx prisma migrate dev
```

This creates `backend/prisma/music-library.db`. See [Database](#database).

### 4. Run it

Run the `dev:*` scripts from this package's root
(`packages/album-metadata-manager`) — not from `backend/`, where the previous two
steps left you (`cd ..` first):

```bash
# Terminal 1 — backend API (http://localhost:3001)
pnpm dev:backend

# Terminal 2 — frontend (http://localhost:5173)
pnpm dev:frontend
```

Open **http://localhost:5173**.

> **Using Claude Code?** This package ships a `start-dev` skill that runs both
> servers in a detached `tmux` session (`mt-dev`), so they outlive the Claude
> session and write logs to `/tmp/mt-backend.log` and `/tmp/mt-frontend.log`. Ask
> Claude to "start the dev servers" (or invoke `/start-dev`) instead of opening
> two terminals. Stop them with `tmux kill-session -t mt-dev`.

### 5. Connect Plex

Open the **Settings** page in the app and connect to Plex via OAuth, then pick the
server and music library to use. The Plex token and server selection are stored in the
database (not in env) so you can switch servers without editing files. Only the Plex
base URL (`PLEX_URL`) comes from `.env`.

Once connected, use **Scan Library** to import your albums, then start matching.

## Configuration

All configuration lives in `backend/.env` (copied from `backend/.env.template`). `.env`
is gitignored, so your keys and any machine-specific settings stay local and are never
committed.

**[`backend/.env.template`](./backend/.env.template) is the single source of truth** for
the full list of variables — every one is documented inline there. The only values you
must fill in are covered in [Setup](#setup); everything else ships with working defaults.

### Cloudflare caching proxy (optional)

The template ships with the proxy **disabled** (`REDACTED_USE_CLOUDFLARE=false`), so a fresh
clone talks to Redacted directly. The optional Cloudflare Worker in [`cloudflare/`](./cloudflare/)
caches Redacted responses to improve performance and respect rate limits.

To enable it, set these in your (gitignored) `backend/.env`:

```bash
REDACTED_USE_CLOUDFLARE=true
CLOUDFLARE_WORKER_URL=https://your-worker.workers.dev
```

See [`cloudflare/README.md`](./cloudflare/README.md) for deploying the worker.

## Database

- A single SQLite file, **stored alongside the code by default** at
  `backend/prisma/music-library.db` (no external-drive setup needed).
- Only the database is local to the repo; your actual audio files stay wherever
  `MUSIC_LIBRARY_PATH` points.
- `DATABASE_URL` is kept as an env var (rather than hardcoded) so that the test suite
  can use an isolated database — `server.js` loads `.env.test` (a separate
  `test-music-library.db`) when `NODE_ENV=test`. The default value ships in
  `.env.template`, so a fresh clone needs no database configuration.

Useful commands (run from `backend/`):

```bash
npx prisma migrate dev     # apply migrations / create the DB
npx prisma studio          # browse the database
npx prisma migrate reset   # wipe the DB (your music files are untouched)
```

## Tech stack

- **Backend**: Node.js + Express, Prisma ORM over SQLite, `@ctrl/plex` for Plex.
- **Frontend**: React + Vite + Tailwind CSS, TanStack Query for data fetching.
- **Metadata**: Redacted (primary), MusicBrainz (secondary).

## Testing

End-to-end tests use Playwright with copy-based isolation (tests run against temporary
copies of your music files and an isolated test database). Run from this package's root
(`packages/album-metadata-manager`):

```bash
pnpm test:e2e
```

The runner seeds each run from `MUSIC_LIBRARY_PATH` (the same value as your
`backend/.env`), so make sure that points at a real folder of audio files before running
— otherwise the copy step has nothing to copy. On the first run, install the Playwright
browsers once with `pnpm test:e2e:install`.
