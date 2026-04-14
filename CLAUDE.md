# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a pnpm monorepo for DJ tools and music management utilities. The codebase uses TypeScript with ESNext modules and has a composite TypeScript configuration.

### Repository Organization
- **Root**: Contains workspace configuration and shared TypeScript setup
- **packages/youtube-tracklist**: Main package that extracts tracklists from YouTube video comments using Claude AI
- **packages/youtube-track-recogniser**: Identifies individual tracks from YouTube videos using audio fingerprinting (Shazam, AudD, ACRCloud)
- **packages/metadata-manager**: Local music file metadata manager — frontend + backend for viewing/organising ID3/Vorbis tags and driving the beets singles library (genre tagging, inbox import pipeline)

### Package Architecture (youtube-tracklist)
The youtube-tracklist package follows a modular architecture:
- `YouTubeClient`: Handles YouTube Data API v3 interactions and comment fetching
- `ClaudeClient`: Manages Anthropic Claude API calls for AI-powered track extraction  
- `CommentProcessor`: Filters, prioritizes, and batches comments for efficient processing
- `YouTubeTracklistExtractor`: Main orchestrator class that coordinates the extraction pipeline

The extraction pipeline: fetch comments → filter relevant threads → batch for AI processing → extract tracks with Claude → deduplicate results

## Common Commands

### Development Commands
```bash
# Build all packages
pnpm build

# Development mode with watch
pnpm dev

# Run tests across all packages  
pnpm test

# Lint all packages
pnpm lint

# Clean build artifacts
pnpm clean
```

### Package-Specific Commands

#### youtube-tracklist (Extract full tracklists from DJ mixes/sets)
```bash
# Build specific package
pnpm --filter youtube-tracklist build

# Run CLI tool for extraction (requires build first)
pnpm --filter youtube-tracklist cli extract "https://youtube.com/watch?v=VIDEO_ID"

# Run with options
pnpm --filter youtube-tracklist cli extract "VIDEO_ID" --max-comments 500 --format json

# Clean specific package
pnpm --filter youtube-tracklist clean
```

#### youtube-track-recogniser (Identify individual songs)
```bash
# Run track recognition on a YouTube video
cd packages/youtube-track-recogniser && node src/cli.js "https://youtube.com/watch?v=VIDEO_ID"

# Or use the shorter alias
cd packages/youtube-track-recogniser && ytr "VIDEO_ID"
```

#### beets (Music library management, driven by metadata-manager)
```bash
# Run beets commands directly (installed via pipx)
beet ls                    # List library items
beet import ~/Music/path   # Import music
beet stats                 # Library statistics
```

Beets is installed via pipx. Install plugins with `pipx inject beets <package>`.
Use `/beets-status` slash command to check beets health.
The metadata-manager backend drives the full inbox import pipeline (see `packages/metadata-manager/CLAUDE.md`).

### IMPORTANT: Track Identification Instructions
When a user asks "what song is this?", "find me this track", "identify this song", or provides a YouTube URL asking for track identification:
1. **USE youtube-track-recogniser** - This tool uses audio fingerprinting to identify individual songs
2. **DO NOT USE youtube-tracklist** - This is for extracting full DJ set tracklists from comments, not for identifying individual songs
3. The command is: `cd packages/youtube-track-recogniser && node src/cli.js "URL"`

## Environment Setup

### Shared Environment Variables (Root `.env`)
The following API keys are shared across multiple packages and should be placed in the root `.env` file:
- `YOUTUBE_API_KEY`: YouTube Data API v3 key (used by youtube-tracklist and youtube-track-recogniser)
- `ANTHROPIC_API_KEY`: Claude API key (used by youtube-tracklist and youtube-track-recogniser)
- `AUDIO_TEMP_DIR`: Temporary directory for audio processing
- `MAX_AUDIO_LENGTH`: Maximum audio duration in seconds
- `AUDIO_QUALITY`: Audio quality setting

### Package-Specific Environment Variables
Music recognition APIs are configured in `packages/music-recogniser/.env`:
- `RAPIDAPI_SHAZAM_KEY`: Shazam API key via RapidAPI
- `AUDD_API_KEY`: AudD.io API key  
- `ACRCLOUD_ACCESS_KEY`: ACRCloud access key
- And related configuration

Copy `.env.example` files to `.env` and populate with your API keys.

## Key Technologies
- **pnpm**: Package manager and workspace management
- **TypeScript**: Configured for ES2022 target with ESNext modules  
- **Google APIs**: YouTube Data API v3 client
- **Anthropic SDK**: Claude AI integration
- **Commander.js**: CLI framework
- **dotenv**: Environment variable management

## Development Notes

The codebase uses TypeScript project references for efficient incremental builds. The main package exports both CommonJS and ESM formats with proper type definitions.

Rate limiting is implemented for both YouTube and Claude API calls to respect service limits. The AI extraction uses intelligent batching and confidence scoring to optimize results.