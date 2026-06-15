# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music-tagger is a local music library management application focused on displaying, organizing, and correcting ID3 metadata for music collections. The app is designed to handle approximately 5000 albums with manual library scanning and ID3 tag correction capabilities.

## Architecture

### Tech Stack
- **Backend**: Node.js + Express REST API
- **Database**: SQLite (portable, single-file database)
- **Frontend**: React + Tailwind CSS + TanStack Query (React Query)
- **ORM**: Prisma for SQLite schema management and migrations
- **Data Fetching**: TanStack Query for all API interactions (REQUIRED)
- **Development**: Web-first approach with future Electron migration path

### Development Philosophy
- **Web-first development**: Build as web app initially for faster iteration
- **Electron migration ready**: Architecture designed for future desktop app conversion
- **Portable database**: SQLite file can be stored on external drives alongside music files
- **Local-first**: No cloud dependencies, all data stays on user's machine

## Database Strategy

### SQLite Configuration
- Single `.db` file for complete portability
- Default location: `./music-library.db` in app directory
- User-configurable database location for external drive storage
- Handles drive mounting/unmounting scenarios gracefully

### External Drive Support Pattern
```
External Drive Structure:
/Volumes/Music-Drive/
├── Music/           # User's music files
├── music-library.db # SQLite database
└── album-art/       # Cached album artwork
```

### Database Schema Design
- **albums** table: album metadata, artwork paths, directory info
- **tracks** table: individual song metadata, file paths, ID3 tags
- **artists** table: artist information and relationships
- JSON columns for flexible ID3 tag storage
- Full-text search capabilities for large music libraries
- Proper indexing for performance with 5000+ albums

### Prisma Migration Rule
**CRITICAL: Every `schema.prisma` edit MUST be followed by `npx prisma migrate dev`**

Prisma workflow:
1. `schema.prisma` = declaration of what tables you want
2. `npx prisma migrate dev` = generates the SQL migration file
3. `prisma migrate reset` (what `/reset-db` runs) = runs all migration files

Without step 2, the migration file doesn't exist, and reset won't create the table.

Always:
1. Edit `schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Commit both schema.prisma AND the new migration folder

## Development Environment

### Node.js Setup
- Node.js v20 (LTS jod) as specified in `.nvmrc`
- Use `nvm use` to switch to correct version

### Project Structure
```
album-metadata-manager/
├── frontend/          # React + Tailwind CSS + TanStack Query
│   ├── src/
│   │   ├── api/       # API layer (fetch functions)
│   │   ├── hooks/     # Custom React Query hooks
│   │   ├── components/# React components
│   │   └── pages/     # Page components
├── backend/           # Node.js + Express API
│   ├── services/      # Business logic services
│   │   └── metadata/  # External API integrations
│   └── prisma/        # Prisma schema and migrations
├── .nvmrc            # Node.js version specification
└── CLAUDE.md         # This file
```

### Development Commands
**Frontend (from /frontend directory):**
- `npm run dev` - Start React development server (http://localhost:5173)
- `npm run build` - Build production assets
- `npm run lint` - Run ESLint

**Backend (from /backend directory):**
- `npm run dev` - Start Express API server (http://localhost:3001)
- `npx prisma migrate dev` - Run database migrations
- `npx prisma studio` - Open Prisma database browser

**Both servers must be running for full functionality**

### 🚨 CRITICAL: Environment Variable Changes Rule
**ALWAYS restart ALL servers when .env files are modified.**

Environment variables are loaded when Node.js processes start and are NOT updated during runtime, even with nodemon auto-restart.

#### Required Workflow:
1. **Kill ALL running servers** (backend AND frontend):
   ```bash
   lsof -ti:3001 | xargs kill -9 2>/dev/null  # Kill backend
   lsof -ti:5173 | xargs kill -9 2>/dev/null  # Kill frontend
   ```

2. **Start servers fresh** with `/start-dev` or `/start-dev test`

#### When This Rule Applies:
- ✅ Any modification to `.env` files
- ✅ Any modification to `.env.test` files
- ✅ Switching between test and production environments
- ✅ Adding/changing any environment variable
- ✅ After editing files that read `process.env` at module load time

#### Why This Matters:
- **Nodemon restarts** only reload file changes, NOT environment variables
- **Module-level constants** capture `process.env` values at import time
- **Cached values** persist across nodemon restarts within the same process
- **Only a full process kill** ensures fresh environment variable loading

**DO NOT** assume nodemon restart is sufficient. **ALWAYS** do a full server kill and restart.

## Key Features & Implementation

### Core Functionality
1. **Album Library View**: Grid/list display of ~5000 albums with pagination
2. **Album Detail Pages**: Individual album view with track listings and metadata
3. **Manual Library Scanning**: "Scan Library" button for importing music files
4. **Metadata Lookup**: Multi-API integration (Spotify, MusicBrainz, Discogs)
5. **Album Artwork**: Display embedded artwork from music files

### API Design (REST Endpoints)
**Implemented Endpoints:**
- `GET /health` - Health check endpoint
- `GET /api/albums` - List albums with pagination
- `GET /api/albums/:id` - Get single album with tracks
- `GET /api/albums/:id/artwork` - Get album artwork image
- `POST /api/library/scan` - Start library scan
- `GET /api/library/scan/progress` - Get scan progress status
- `DELETE /api/library/scan` - Stop library scan
- `GET /api/albums/:id/metadata/search` - Search metadata across all APIs

**Future Endpoints (not yet implemented):**
- `PUT /api/albums/:id/metadata` - Apply selected metadata to album
- `GET /api/search` - Full-text search across albums/tracks/artists

### File System Access
- **Web**: Use File System Access API for folder selection
- **Future Electron**: Use native file dialogs and fs module
- Graceful fallback for browsers without File System Access API support

## External API Integrations

### API Quick Reference

#### MusicBrainz API
- **Docs**: https://musicbrainz.org/doc/MusicBrainz_API
- **Library**: `musicbrainz-api` npm package
- **Base URL**: `https://musicbrainz.org/ws/2`
- **Search Method**: `mbApi.search('release', { query: { release, artist, date }, limit: 10 })`
- **Lookup Method**: `mbApi.lookup('release', mbid, { inc: 'artists+recordings+release-groups+genres' })`
- **Authentication**: User-Agent header only (no API key required)
- **Rate Limiting**: 1 request per second (handled automatically by library)
- **Key Endpoints**:
  - Search releases: `/ws/2/release?query=...`
  - Lookup release: `/ws/2/release/{mbid}`
- **Data Returned**: Album title, artist, release date, track count, genres, MBID

#### Spotify Web API
- **Docs**: https://developer.spotify.com/documentation/web-api
- **Base URL**: `https://api.spotify.com/v1`
- **Authentication**: Client Credentials flow (OAuth 2.0)
  - Token endpoint: `https://accounts.spotify.com/api/token`
  - Token lifespan: 1 hour
- **Rate Limiting**: ~100 requests per second (generous limits)
- **Key Endpoints**:
  - Search: `GET /v1/search?q=...&type=album&limit=10`
  - Get album: `GET /v1/albums/{id}`
  - Get artist (for genres): `GET /v1/artists/{id}`
- **Data Returned**: Album title, artist, release date, track count, genres (from artist), cover art

#### Discogs API
- **Docs**: https://www.discogs.com/developers
- **Base URL**: `https://api.discogs.com`
- **Authentication**: Personal access token via `Authorization: Discogs token={token}` header
- **Rate Limiting**: 60 requests per minute for authenticated requests
- **Key Endpoints**:
  - Search: `GET /database/search?q=...&type=release&artist=...&title=...`
  - Get release: `GET /releases/{id}`
- **Data Returned**: Album title, artist, release year, genres/styles, label, catalog number, cover images

#### MusicTracker/Redacted API
- **Docs**: `/docs/music-tracker-api.md` (full documentation stored locally)
- **Base URL**: `https://{user-domain}/ajax.php`
- **Authentication**: `Authorization: {api_key}` header
- **Rate Limiting**: 10 requests per 10 seconds (strictly enforced)
  - Implemented via `musicTrackerLimiter` with per-API-key queuing
- **Key Endpoints**:
  - Search/Browse: `GET /ajax.php?action=browse&searchstr={query}`
  - Get torrent group: `GET /ajax.php?action=torrentgroup&id={id}`
- **Data Returned**: Album title, artist, year, genres/tags, torrent details, cover art URLs
- **Special Features**:
  - Per-user API keys supported
  - Returns multiple torrent editions per release
  - Includes rip quality metadata (FLAC, MP3, etc.)

### Environment Variables Required
```
# Backend .env file
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
DISCOGS_TOKEN=your_discogs_token
MUSICBRAINZ_CONTACT_INFO=user@example.com

# MusicTracker (Optional)
MUSICTRACKER_ENABLED=false
MUSICTRACKER_API_KEY=your_api_key
MUSICTRACKER_DOMAIN=your_domain
MUSICTRACKER_RATE_LIMIT_REQUESTS=10
MUSICTRACKER_RATE_LIMIT_WINDOW=10000
MUSICTRACKER_MIN_REQUEST_DELAY=1200
```

## Frontend Data Fetching Standards

### TanStack Query (React Query) - REQUIRED
**All API interactions must use TanStack Query. No direct fetch calls in components.**

### Architecture Pattern
```
src/
├── api/              # Pure fetch functions
│   ├── albums.js     # fetchAlbums, fetchAlbum functions  
│   ├── library.js    # startLibraryScan, fetchScanProgress
│   └── metadata.js   # fetchMetadataSearch
├── hooks/            # Custom React Query hooks
│   ├── useAlbums.js  # useQuery for albums
│   ├── useAlbum.js   # useQuery for single album
│   └── useMetadataSearch.js # useQuery for metadata search
└── components/       # Components use hooks, never direct API calls
```

### Hook Naming Convention
- **Queries**: `useResource` (e.g., `useAlbums`, `useAlbum`, `useMetadataSearch`)
- **Mutations**: `useActionResource` (e.g., `useStartLibraryScan`, `useStopLibraryScan`)

### Example Implementation
```javascript
// ✅ Correct: API layer
export async function fetchAlbums({ page = 1, limit = 20 }) {
  const response = await fetch(`/api/albums?page=${page}&limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch albums');
  return response.json();
}

// ✅ Correct: Custom hook
export function useAlbums(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['albums', { page, limit }],
    queryFn: () => fetchAlbums({ page, limit }),
    keepPreviousData: true,
  });
}

// ✅ Correct: Component usage
function AlbumsPage() {
  const { data, isLoading, error } = useAlbums(page, limit);
  // Component logic...
}
```

### Query Configuration Standards
- **Stale Time**: 5 minutes for metadata that doesn't change often
- **Cache Time**: 10 minutes default
- **Keep Previous Data**: Use for paginated results
- **Error Handling**: Always handle isError state in components
- **Loading States**: Always handle isLoading state in components

### Mutation Patterns
```javascript
// For POST/PUT/DELETE operations
export function useStartLibraryScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startLibraryScan,
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });
}
```

## Future Electron Migration

### Architecture Considerations
- Database connection patterns work identically in Electron
- File system access: File System Access API → Node.js `fs` module
- Window management: Browser tabs → Electron BrowserWindow
- Menu integration: Web menus → native macOS menu bar

### Migration Strategy
1. Wrap React app in Electron main process
2. Replace File System Access API with Electron dialogs
3. Add native menu bar and keyboard shortcuts
4. Implement auto-updater for desktop app distribution

## Claude Code Interaction Rules

### Web-Only Operations Rule
**CRITICAL: All operations must happen through the web interface.**

Claude Code should NEVER manually trigger operations via:
- Direct API calls (e.g., `curl -X POST /api/library/scan`)
- Backend function calls
- Database operations
- File system modifications

### Allowed Claude Actions
Claude Code may ONLY:
1. **Monitor server logs** via `BashOutput` tool to track progress
2. **Read-only status checks** via GET endpoints:
   - `GET /health` - Verify server status
   - `GET /api/albums` - View current album data
   - `GET /api/albums/:id` - View single album details
   - `GET /api/library/scan/progress` - Check scan status
   - `GET /api/albums/:id/metadata/search` - Check metadata search results
3. **View files** for analysis and debugging
4. **Start/stop development servers** for testing

### Required User Workflow
1. User opens web interface (http://localhost:5173)
2. User clicks buttons/interacts with UI to trigger operations
3. Claude monitors progress through server logs
4. Claude can provide status updates based on log monitoring

### Monitoring Best Practices
- Use `BashOutput` to check server logs for operation progress
- Check API status endpoints to report current state
- Never bypass the web interface for operational functions
- Guide users to use the web UI for all library management tasks

## Development Guidelines

### Code Conventions
- **CRITICAL**: All frontend API calls must use TanStack Query hooks
- Follow existing patterns when adding new features
- Use the established API layer + hooks pattern (see Frontend Data Fetching Standards)
- Implement proper error handling for file system operations
- Always handle loading and error states in React components
- Use consistent naming for API functions and hooks

### Performance Considerations
- Implement pagination for large album collections
- Use database indexing for search operations
- Cache album artwork locally to reduce re-fetching
- Optimize file system scanning for large music directories

### Testing Strategy
- **E2E Tests**: Playwright-based end-to-end testing with copy-based isolation
  - Uses real music files from `/Volumes/T7/AlbumsTest` as seed data
  - Creates temporary copies at `/Volumes/T7/test-music-{uuid}` for each test run
  - Ensures file mutation safety - tests can modify files without affecting source data
  - Automatic cleanup of temporary music directories after test completion
  - Isolated test database (`test-music-library.db`) separate from development data
- Unit tests for API endpoints and database operations
- Integration tests for music file scanning and metadata extraction
- Test external drive scenarios and database portability
- Mock external APIs (MusicBrainz) for consistent testing
- You made a change to the buttons and it broke the frontend. Can you remember to, at the very least, do some test (maybe npm lint? npm build? whatever you think is best) before asking me to verify the code?
- Remember that the docs for the Muisctracker api are in /docs/music-tracker-api.md