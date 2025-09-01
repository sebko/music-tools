# @dj-tools/youtube-tracklist

Extract tracklists from YouTube video comments using Claude AI. Supports multiple languages and intelligent context analysis.

## Installation

```bash
pnpm add @dj-tools/youtube-tracklist
```

## Setup

You need two API keys:

1. **YouTube Data API v3 Key**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable YouTube Data API v3
   - Create an API key

2. **Anthropic Claude API Key**
   - Go to [Anthropic Console](https://console.anthropic.com/)
   - Create an API key

Set environment variables:
```bash
export YOUTUBE_API_KEY="your_youtube_api_key"
export ANTHROPIC_API_KEY="your_anthropic_api_key"
```

Or create a `.env` file:
```
YOUTUBE_API_KEY=your_youtube_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## CLI Usage

### Standalone Installation
```bash
# Extract tracklist from a YouTube video
npx @dj-tools/youtube-tracklist extract "https://youtube.com/watch?v=VIDEO_ID"

# With options
npx @dj-tools/youtube-tracklist extract "VIDEO_ID" --max-comments 500 --min-confidence 0.5

# JSON output
npx @dj-tools/youtube-tracklist extract "VIDEO_ID" --format json

# Setup help
npx @dj-tools/youtube-tracklist setup
```

### Development in Monorepo
```bash
# First, build the package
pnpm --filter youtube-tracklist build

# Extract tracklist from a YouTube video
pnpm --filter youtube-tracklist cli extract "https://youtube.com/watch?v=VIDEO_ID"

# With options
pnpm --filter youtube-tracklist cli extract "VIDEO_ID" --max-comments 500 --min-confidence 0.5

# JSON output
pnpm --filter youtube-tracklist cli extract "VIDEO_ID" --format json

# Setup help
pnpm --filter youtube-tracklist cli setup
```

## Programmatic Usage

```typescript
import { YouTubeTracklistExtractor, extractTracklist } from '@dj-tools/youtube-tracklist';

// Simple usage
const result = await extractTracklist('https://youtube.com/watch?v=VIDEO_ID');

// Advanced usage
const extractor = new YouTubeTracklistExtractor();
const result = await extractor.extractTracklist('VIDEO_ID', {
  maxComments: 500,
  minConfidence: 0.4
});

console.log(result.tracks);
console.log(result.metadata);
```

## Features

- **AI-Powered**: Uses Claude AI for intelligent track extraction
- **Multi-Language**: Supports English, Spanish, Portuguese, and more
- **Context Aware**: Understands comment threads and replies
- **Smart Filtering**: Finds tracks in various formats and contexts
- **Confidence Scoring**: Each extraction includes a confidence rating
- **Deduplication**: Automatically merges duplicate tracks
- **Rate Limited**: Built-in API rate limiting

## Output Format

```typescript
interface TracklistResult {
  tracks: TrackEntry[];
  metadata: ExtractionMetadata;
}

interface TrackEntry {
  artist: string;        // "Deadmau5"
  title: string;         // "Strobe"
  timestamp?: string;    // "03:45" (if found)
  confidence: number;    // 0.95 (0-1 scale)
  context: string;       // Original comment text
  language?: string;     // "en", "es", etc.
}
```

## CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--max-comments` | `-c` | Maximum number of comments to process | 1000 |
| `--min-confidence` | `-m` | Minimum confidence threshold (0-1) | 0.3 |
| `--format` | `-f` | Output format (`json` or `table`) | table |

## Examples

### Sample Output (Table Format)
```
📊 Extraction Results for Video: dQw4w9WgXcQ

Found 3 tracks:

Time    Artist                   Title                         Confidence
---------------------------------------------------------------------------
02:15   Deadmau5                 Strobe                        95%
05:30   Porter Robinson          Language                      87%
—       Above & Beyond           Sun & Moon                    92%

📈 Metadata:
  Total Comments: 245
  Processed: 127
  API Calls: 3
```

### Comment Formats Supported

The AI can extract tracks from various comment formats:

- `"3:45 Deadmau5 - Strobe"`
- `"What song is this?" → "Porter Robinson - Language"`
- `"ID?" → "Above & Beyond - Sun & Moon"`
- `"¿Qué canción es esta?" → "Tiësto - Adagio for Strings"`
- `"This is fire 🔥" → "Calvin Harris - Feel So Close"`

## Troubleshooting

### No Tracks Found
If you get "No tracks found in the comments":
- Check if the video has comments enabled
- Try videos with DJ sets, mixes, or music compilations
- Lower the confidence threshold: `--min-confidence 0.2`
- Increase comment processing: `--max-comments 2000`

### API Errors
- **YouTube API**: Check your `YOUTUBE_API_KEY` is valid and has YouTube Data API v3 enabled
- **Claude API**: Verify your `ANTHROPIC_API_KEY` is active and has sufficient credits
- **Rate Limits**: The tool includes built-in rate limiting, but check your API quotas

### Environment Setup
Create a `.env` file in the package directory:
```bash
cd packages/youtube-tracklist
echo "YOUTUBE_API_KEY=your_youtube_key_here" > .env
echo "ANTHROPIC_API_KEY=your_claude_key_here" >> .env
```