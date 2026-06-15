# YouTube Track Recogniser

Identify individual songs from YouTube videos using audio fingerprinting and comment analysis.

## Quick Start

```bash
# Install dependencies
brew install yt-dlp  # or pip install yt-dlp

# Run with a YouTube URL
cd packages/youtube-track-recogniser
node src/cli.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## What It Does

- **Audio Fingerprinting**: Downloads audio and uses Shazam/AudD/ACRCloud to identify tracks
- **Comment Analysis**: Uses AI to extract track names from YouTube comments  
- **Hybrid Mode**: Combines both methods for maximum accuracy

## Setup

### Required API Keys

Create a `.env` file in the project root:

```bash
# YouTube Data API (required)
YOUTUBE_API_KEY=your_youtube_key

# Claude AI (required for comments)
ANTHROPIC_API_KEY=your_claude_key

# Music Recognition (at least one required)
RAPIDAPI_SHAZAM_KEY=your_shazam_key
AUDD_API_KEY=your_audd_key
ACRCLOUD_ACCESS_KEY=your_acrcloud_key
```

**Get API Keys:**
- YouTube: [Google Cloud Console](https://console.cloud.google.com/) → Enable YouTube Data API v3
- Claude: [Anthropic Console](https://console.anthropic.com/)
- Shazam: [RapidAPI Shazam](https://rapidapi.com/apidojo/api/shazam/)
- AudD: [AudD.io](https://audd.io/)
- ACRCloud: [ACRCloud Console](https://console.acrcloud.com/)

## Usage

### Default Mode (Recommended)
Combines audio fingerprinting with comment analysis:

```bash
node src/cli.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Audio Only
```bash
node src/cli.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --audio-only
```

### Comments Only
```bash
node src/cli.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --comments-only
```

### Options
```bash
node src/cli.js "URL" [options]

Options:
  -m, --mode <type>         Recognition intensity (low|medium|high) [default: medium]
  --audio-only             Use only audio fingerprinting
  --comments-only          Use only comment analysis
  --max-comments <number>   Maximum comments to analyze [default: 500]
  -f, --format <type>       Output format (json|table) [default: table]
```

## Programmatic Usage

```javascript
const { identifyHybrid } = require('./src/index.js');

// Hybrid recognition (recommended)
const result = await identifyHybrid('https://youtube.com/watch?v=dQw4w9WgXcQ');

if (result) {
  console.log(`${result.artist} - ${result.title}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Source: ${result.source}`); // 'audio', 'comments', or 'both'
}
```

## Example Output

```
🎵 Best Match:
==================================================
🎤 Artist: Rick Astley
🎧 Title: Never Gonna Give You Up
📊 Confidence: 100%
🔧 Source: both
🤝 VALIDATED: Both audio and comments agree!

📈 Processing Details:
   Audio Recognition: ✅
   Comment Analysis: ✅
   Total Time: 15s

📺 YouTube Info:
   Title: Rick Astley - Never Gonna Give You Up (Official Video)
   Channel: Rick Astley
   Duration: 3:33
```

## Troubleshooting

**"yt-dlp not found"**: Install yt-dlp with `brew install yt-dlp` or `pip install yt-dlp`

**"No track identified"**: Try different modes or check if the video contains music

**"API key required"**: Set up your API keys in the `.env` file

## Single Track Only

This tool is designed for individual songs. For DJ mixes or multi-track content, use `@music-tools/youtube-tracklist` instead.