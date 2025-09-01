# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a pnpm monorepo for DJ tools and music management utilities. The codebase uses TypeScript with ESNext modules and has a composite TypeScript configuration.

### Repository Organization
- **Root**: Contains workspace configuration and shared TypeScript setup
- **packages/youtube-tracklist**: Main package that extracts tracklists from YouTube video comments using Claude AI

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

## Environment Setup

The youtube-tracklist package requires two API keys:
- `YOUTUBE_API_KEY`: YouTube Data API v3 key
- `ANTHROPIC_API_KEY`: Claude API key

These can be set as environment variables or in a `.env` file in the package directory.

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