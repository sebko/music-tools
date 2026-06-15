# Music Tagger

Local music library management application for organizing and correcting ID3 metadata.

## Quick Start

1. **Install dependencies**
   ```bash
   # Backend
   cd backend && npm install

   # Frontend
   cd frontend && npm install
   ```

2. **Configure environment**

   Create `backend/.env`:
   ```
   DATABASE_URL="file:./music-library.db"
   MUSIC_LIBRARY_PATH="/path/to/your/music/folder"

   # Optional API keys for metadata lookup
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   DISCOGS_TOKEN=your_discogs_token
   ```

3. **Run application**
   ```bash
   # Terminal 1 - Backend (port 3001)
   cd backend && npm run dev

   # Terminal 2 - Frontend (port 5173)
   cd frontend && npm run dev
   ```

4. **Open http://localhost:5173**

## Database Setup

```bash
cd backend
npx prisma migrate dev
```

## Required Configuration

- **DATABASE_URL**: SQLite database file location
- **MUSIC_LIBRARY_PATH**: Path to your music folder for scanning