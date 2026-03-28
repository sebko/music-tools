# YouTube Setlist Recogniser

Recognize and extract tracklists from YouTube DJ sets, mixes, and long-form music content.

## Features

- 🎛️ Designed for DJ sets and mixes (40+ minutes)
- 💬 Extracts tracklists from YouTube comments using AI
- 🎵 Audio fingerprinting support (coming soon)
- ⏱️ Timeline and cue point generation
- 📊 Multiple output formats (JSON, text, cue sheets)

## Installation

```bash
npm install @dj-tools/youtube-setlist-recogniser
```

Or use directly with npx:
```bash
npx @dj-tools/youtube-setlist-recogniser <youtube-url>
```

## Usage

### CLI

```bash
# Basic usage - recognize a DJ set
ysr "https://www.youtube.com/watch?v=VIDEO_ID"

# Or use the full command
youtube-setlist-recogniser recognize "https://www.youtube.com/watch?v=VIDEO_ID"

# Analyze a video first
ysr analyze "https://www.youtube.com/watch?v=VIDEO_ID"

# Options
ysr "VIDEO_URL" --format json       # Output as JSON
ysr "VIDEO_URL" --no-comments       # Skip comment analysis
ysr "VIDEO_URL" --max-comments 2000 # Analyze more comments
```

### Programmatic Usage

```javascript
const { YouTubeSetlistRecogniser } = require('@dj-tools/youtube-setlist-recogniser');

// Create recogniser instance
const recogniser = new YouTubeSetlistRecogniser({
  mode: 'medium',           // Recognition intensity
  useComments: true,        // Use comment analysis
  maxDuration: 7200         // Max 2 hours
});

// Recognize a setlist
const result = await recogniser.recognize('https://youtube.com/watch?v=...');

console.log(`Found ${result.totalTracks} tracks:`);
result.tracks.forEach(track => {
  console.log(`${track.number}. ${track.artist} - ${track.title}`);
});
```

## Configuration

Create a `.env` file with your API keys:

```env
# Required for comment extraction
YOUTUBE_API_KEY=your_youtube_api_key
ANTHROPIC_API_KEY=your_claude_api_key

# Optional for audio fingerprinting
RAPIDAPI_SHAZAM_KEY=your_shazam_key
AUDD_API_KEY=your_audd_key
ACRCLOUD_ACCESS_KEY=your_acrcloud_key

# Processing settings
AUDIO_TEMP_DIR=./temp
MAX_SETLIST_LENGTH=7200
```

## Differences from youtube-track-recogniser

| Feature | youtube-track-recogniser | youtube-setlist-recogniser |
|---------|-------------------------|--------------------------|
| Purpose | Single track ID | Full DJ set tracklist |
| Video length | < 10 minutes | 10+ minutes |
| Max duration | 1 hour | 2 hours |
| Output | Single track | Multiple tracks with timeline |
| Use case | "What song is this?" | "Extract full setlist" |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Check setup
node src/cli.js setup
```

## License

MIT