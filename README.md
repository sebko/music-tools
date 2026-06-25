# music-tools

A pnpm monorepo of DJ tools and music-management utilities — tracklist extraction,
audio recognition, and local metadata managers for Plex and beets.

## Getting started

Everything runs locally. You need:

- **Node.js** — version in [`.nvmrc`](./.nvmrc) (`nvm use`)
- **pnpm** — v10 or newer (the workspace targets pnpm 11)

```bash
# 1. Install all dependencies for every package (run from the repo root).
#    This also compiles native modules (better-sqlite3) and generates the
#    Prisma client automatically — no extra steps.
pnpm install

# 2. Build all packages once, in dependency order (run from the repo root).
pnpm build
```

> **Why `pnpm build` is required.** The frontend apps import the shared
> `@music-tools/my-component-library` from its built `dist/`, and the
> `youtube-tracklist` CLI runs from its compiled `dist/cli.js`. A fresh clone has no
> `dist/` yet, so `pnpm build` must run once before the apps will start. After that,
> day-to-day you just run each app's `dev` scripts (below). If you're actively editing
> the component library, run its watch build alongside: `pnpm --filter
> @music-tools/my-component-library dev`.

Both commands are run **once at the repo root** — never per package. `pnpm build`
runs `pnpm -r build`, which walks every package in the right order.

> **Expected on the first install:** a couple of `[WARN] Failed to create bin ...
> youtube-tracklist/dist/cli.js` lines. This is harmless — `pnpm install` runs before
> anything is built, so the CLI isn't compiled yet when pnpm links bins. `pnpm install`
> still exits 0, and the warning is gone after `pnpm build`.

### Then: set up the app you want

Each package has its own README with its specific setup (API keys, `.env`, database
migrations, how to run it). After the two root commands above, `cd` into a package and
follow its README:

| Package | What it does | Setup |
| --- | --- | --- |
| [`album-metadata-manager`](./packages/album-metadata-manager/README.md) | Web app to clean up a Plex music library's metadata (Redacted + MusicBrainz lookups, artwork, sync back to Plex/files). | needs `.env` + DB migrate |
| [`singles-metadata-manager`](./packages/singles-metadata-manager) | Local ID3/Vorbis tag viewer/organiser; drives the beets singles library. | needs `.env` + DB migrate |
| [`youtube-tracklist`](./packages/youtube-tracklist/README.md) | Extract full tracklists from a DJ-mix video's comments using Claude. | needs API keys |
| [`youtube-track-recogniser`](./packages/youtube-track-recogniser/README.md) | Identify an individual track from a YouTube video via audio fingerprinting. | needs API keys |
| [`youtube-setlist-recogniser`](./packages/youtube-setlist-recogniser/README.md) | Recognise/extract tracklists from long-form YouTube DJ sets & mixes. | needs API keys |
| [`music-recogniser`](./packages/music-recogniser/README.md) | Audio-recognition library wrapping Shazam, AudD, and ACRCloud. | needs API keys |
| [`rekordbox`](./packages/rekordbox) | Low-level Rekordbox XML library (query tracks, playlists, collection). | — |
| [`my-component-library`](./packages/my-component-library) | Shared React component library used by the frontends. | — |

API keys shared across packages (YouTube, Anthropic) go in a root `.env`; package-specific
keys live in that package's `.env`. See each package's README and `.env` template.

## Workspace commands

Run from the repo root; each fans out across all packages:

```bash
pnpm build    # build every package (pnpm -r build)
pnpm dev      # watch-build every package
pnpm test     # run tests across packages
pnpm lint     # lint across packages
pnpm clean    # remove build artifacts
```

## Notes

- **Build-script approval.** pnpm 10+ blocks dependency install scripts by default for
  supply-chain safety. The trusted packages that need to run them are approved in
  [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) under `allowBuilds`, so `pnpm install`
  works without prompts. If you add a dependency that needs a build step, pnpm will warn
  and you add it there.
- TypeScript project references are used for incremental builds across packages.
