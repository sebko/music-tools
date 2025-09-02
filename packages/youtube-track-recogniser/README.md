# @trackid/youtube-track-recogniser

YouTube **single track** recognition using hybrid audio fingerprinting and comment analysis. Combines music-recogniser (Shazam, AudD, ACRCloud) with youtube-tracklist comment extraction for maximum accuracy.

> **⚠️ Single Track Only**: This package is designed specifically for **individual songs**. For DJ mixes, live sets, or multi-track content, use `@dj-tools/youtube-tracklist` instead.

## Installation

```bash
pnpm add @trackid/youtube-track-recogniser
```

## Prerequisites

- **Node.js** 16.0.0 or higher
- **yt-dlp** (for YouTube audio extraction)
- **Music Recognition APIs** (Shazam, AudD, or ACRCloud)

### Installing yt-dlp

**macOS:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
pip install yt-dlp
```

**Windows:**
```bash
pip install yt-dlp
# or download from https://github.com/yt-dlp/yt-dlp/releases
```

## Setup

Configure API keys for the music recognition services you want to use:

### Environment Setup

The hybrid functionality requires **shared API keys** (root `.env`) and optionally **music recognition APIs** (package-level `.env`):

**Root `.env` (required for hybrid mode):**
```bash 
# Copy root example and edit
cp .env.example .env
# Add YouTube and Claude API keys
```

**Music Recognition APIs (optional, for audio fingerprinting):**
```bash
# Copy music-recogniser example and edit
cd packages/music-recogniser
cp .env.example .env
# Add Shazam, AudD, ACRCloud keys
```

## CLI Usage

### Development in Monorepo
```bash
# Basic examples (includes hybrid method)
pnpm --filter @trackid/youtube-track-recogniser run example:basic

# Hybrid recognition examples
pnpm --filter @trackid/youtube-track-recogniser run example:hybrid

# Test different intensity modes
pnpm --filter @trackid/youtube-track-recogniser run example:intensity
```

## Programmatic Usage

### Hybrid Recognition (Recommended)

```javascript
const { identifyHybrid } = require('@trackid/youtube-track-recogniser');

// Combines audio fingerprinting + comment analysis
const result = await identifyHybrid('https://youtube.com/watch?v=dQw4w9WgXcQ');

if (result) {
  console.log(`${result.artist} - ${result.title}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Source: ${result.source}`); // 'audio', 'comments', or 'both'
  console.log(`Agreement: ${result.agreement}`); // Do both methods agree?
}
```

### Individual Methods

```javascript
const { identify, identifyFromComments } = require('@trackid/youtube-track-recogniser');

// Audio fingerprinting only
const audioResult = await identify('https://youtube.com/watch?v=dQw4w9WgXcQ');

// Comment analysis only  
const commentResult = await identifyFromComments('https://youtube.com/watch?v=dQw4w9WgXcQ');
```

### Advanced Usage

```javascript
const { YouTubeTrackRecogniser } = require('@trackid/youtube-track-recogniser');

// Configure hybrid recognition
const recogniser = new YouTubeTrackRecogniser({
  // Hybrid options
  useComments: true,           // Enable comment analysis (default: true)
  preferAudioResult: true,     // Prefer audio when both succeed (default: true)
  
  // Music recognition config
  musicRecogniser: {
    services: ['shazam', 'audd', 'acrcloud'],
    intensity: 'balanced',
    confidenceThreshold: 0.8
  },
  
  // Comment analysis config
  commentOptions: {
    maxComments: 500,          // Comments to analyze
    minConfidence: 0.4         // Minimum comment confidence
  },
  
  // YouTube download config  
  ytdlp: {
    quality: 'bestaudio',
    format: 'mp3',
    duration: 30              // seconds to download
  }
});

// Use hybrid method
const result = await recogniser.identifyHybrid('https://youtube.com/watch?v=VIDEO_ID');
```

### Intensity Modes

```javascript
// Quick mode - single service, fast response
const quickResult = await recogniser.identify(url, { 
  intensity: 'quick',
  services: ['shazam']
});

// Balanced mode - multiple services with consensus
const balancedResult = await recogniser.identify(url, { 
  intensity: 'balanced'
});

// Exhaustive mode - all services, maximum accuracy
const exhaustiveResult = await recogniser.identify(url, { 
  intensity: 'exhaustive'
});
```

### Video Information

```javascript
const { getVideoInfo } = require('@trackid/youtube-track-recogniser');

// Get video metadata without recognition
const info = await getVideoInfo('https://youtube.com/watch?v=dQw4w9WgXcQ');
console.log(info.title, info.duration, info.uploader);
```

## Recognition Results

### Hybrid Result Format

```typescript
interface HybridRecognitionResult {
  // Primary track information (from best method)
  artist: string;           // "Rick Astley"
  title: string;            // "Never Gonna Give You Up"
  album?: string;           // "Whenever You Need Somebody" 
  confidence: number;       // 0.95 (0-1 scale)
  
  // Hybrid-specific fields
  source: string;           // 'audio', 'comments', or 'both'
  agreement: boolean;       // Do audio and comments agree?
  
  // Cross-validation data
  commentsFound?: {
    artist: string;         // What comments identified
    title: string;
    confidence: number;
    context: string;        // Original comment text
    matchesAudio: boolean;  // Agrees with audio result?
  };
  
  // Recognition details
  service?: string;         // "shazam" (if audio was used)
  intensity?: string;       // "balanced" (if audio was used)
  processing_time_ms: number; // 3250
  
  // YouTube information
  youtube: {
    video_id: string;       // "dQw4w9WgXcQ"
    title: string;          // "Rick Astley - Never Gonna Give You Up (Official Video)"
    uploader: string;       // "Rick Astley"
    duration: number;       // 213 seconds
    view_count: number;     // 1234567890
    upload_date: string;    // "20091025"
  };
  
  // Audio extraction info
  audio_segment: {
    start_time: number;     // 30 (seconds from start)
    duration: number;       // 15 (seconds extracted)
    sample_rate: number;    // 44100
    format: string;         // "mp3"
  };
  
  // External platform IDs
  external_ids?: {
    spotify?: string;
    apple_music?: string;
    youtube_music?: string;
  };
  
  // Enhanced processing info (hybrid)
  processing: {
    total_time_ms: number;      // Total time for both methods
    methods_used: string[];     // ['audio', 'comments']
    audio_success: boolean;     // Did audio recognition work?
    comments_success: boolean;  // Did comment analysis work?
    agreement: boolean;         // Do results match?
  };
  
  // Additional metadata
  metadata?: {
    genre?: string;
    release_date?: string;
    isrc?: string;
    label?: string;
  };
}
```

## Configuration Options

```javascript
const recogniser = new YouTubeTrackRecogniser({
  // Music recognition settings
  musicRecogniser: {
    services: ['shazam', 'audd', 'acrcloud'],
    intensity: 'balanced',              // 'quick', 'balanced', 'exhaustive'
    confidenceThreshold: 0.7,
    consensusThreshold: 0.8,
    timeout: 45000
  },
  
  // YouTube download settings
  ytdlp: {
    quality: 'bestaudio',              // Audio quality preference
    format: 'mp3',                     // Output format
    duration: 30,                      // Seconds to download
    startTime: 60,                     // Start from this time (seconds)
    cookies: './cookies.txt',          // Cookie file for private videos
    userAgent: 'Mozilla/5.0...',       // Custom user agent
    proxy: 'http://proxy:8080'         // Proxy server
  },
  
  // Audio processing
  audio: {
    samplePoints: [0.1, 0.3, 0.5, 0.7], // Multiple recognition attempts
    segmentDuration: 15,                // Seconds per segment
    tempDir: './temp',                  // Temporary file directory
    keepAudio: false                    // Keep downloaded audio files
  },
  
  // Output options
  includeVideoInfo: true,              // Include YouTube metadata
  includeAudioInfo: true,              // Include audio extraction details
  includeRawResults: false             // Include raw recognition results
});
```

## Error Handling

```javascript
try {
  const result = await recogniser.identify(url);
} catch (error) {
  if (error.message.includes('yt-dlp')) {
    console.error('yt-dlp not found. Please install yt-dlp.');
  } else if (error.message.includes('Private video')) {
    console.error('Video is private or restricted');
  } else if (error.message.includes('No music recognition')) {
    console.error('No recognition services configured');
  } else if (error.message.includes('Video not found')) {
    console.error('YouTube video not found or unavailable');
  } else {
    console.error('Recognition error:', error.message);
  }
}
```

## Examples

### Basic Recognition
```javascript
const result = await identify('https://youtu.be/dQw4w9WgXcQ');
if (result) {
  console.log(`🎵 ${result.artist} - ${result.title}`);
  console.log(`📺 Video: ${result.youtube.title}`);
  console.log(`⭐ Confidence: ${(result.confidence * 100).toFixed(1)}%`);
}
```

### Batch Processing
```javascript
const urls = [
  'https://youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/fJ9rUzIMcZQ',
  'https://youtube.com/watch?v=9bZkp7q19f0'
];

const results = await Promise.all(
  urls.map(url => identify(url).catch(err => ({ error: err.message, url })))
);

results.forEach((result, i) => {
  if (result.error) {
    console.log(`❌ ${urls[i]}: ${result.error}`);
  } else {
    console.log(`✅ ${result.artist} - ${result.title}`);
  }
});
```

### Live Stream Recognition
```javascript
// For live streams, specify a start time
const result = await recogniser.identify('https://youtube.com/watch?v=LIVE_ID', {
  ytdlp: {
    startTime: 0,      // Start from current time
    duration: 20       // Extract 20 seconds
  },
  intensity: 'quick'   // Fast response for real-time
});
```

## Supported YouTube Formats

- Standard videos: `https://youtube.com/watch?v=VIDEO_ID`
- Short URLs: `https://youtu.be/VIDEO_ID`  
- Playlist videos: `https://youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`
- Timestamped links: `https://youtube.com/watch?v=VIDEO_ID&t=60s`
- Mobile links: `https://m.youtube.com/watch?v=VIDEO_ID`
- Music links: `https://music.youtube.com/watch?v=VIDEO_ID`

## Performance Tips

1. **Use Quick Mode** for faster results when high accuracy isn't critical
2. **Limit Audio Duration** to reduce processing time and API costs
3. **Strategic Sampling** - use multiple sample points for better accuracy
4. **Cache Results** to avoid re-processing the same videos
5. **Batch Process** multiple videos to optimize resource usage

## Troubleshooting

### yt-dlp Issues
- **Installation**: Ensure yt-dlp is installed and in PATH
- **Updates**: Keep yt-dlp updated: `pip install --upgrade yt-dlp`
- **Region Blocks**: Use proxy or VPN for geo-restricted content
- **Private Videos**: Provide cookies file for private/unlisted videos

### Recognition Failures
- **Audio Quality**: Some YouTube videos have poor audio quality
- **Short Clips**: Ensure videos are long enough for recognition
- **Music Type**: Rare or very new tracks may not be in recognition databases
- **Background Noise**: Videos with talking/effects may interfere

### API Limitations
- **Rate Limits**: Built-in rate limiting, but check your API quotas
- **Service Availability**: Different services have different coverage
- **Costs**: Monitor API usage, especially for ACRCloud and AudD

## Why Hybrid Recognition?

### Method Comparison

| Method | Strengths | Weaknesses | Best For |
|--------|-----------|------------|----------|
| **Audio Fingerprinting** | High accuracy for known tracks, rich metadata | Requires good audio quality, may miss rare tracks | Popular/commercial songs |
| **Comment Analysis** | Captures rare/unreleased tracks, works with poor audio | Depends on community, may have typos | Underground/unreleased music |
| **Hybrid (Both)** | Best of both worlds, validation, fallback options | Slightly slower | Maximum accuracy |

### When to Use Each Approach

```javascript
// For maximum accuracy (recommended)
const result = await identifyHybrid(url);

// When you only need audio fingerprinting  
const result = await identify(url);

// When audio quality is poor but comments might help
const result = await identifyFromComments(url);
```

### Confidence Levels

- **Both methods agree** (`source: 'both'`): Highest confidence
- **Audio only** (`source: 'audio'`): High confidence for known tracks  
- **Comments only** (`source: 'comments'`): Good for rare tracks
- **Conflicting results**: Manual review recommended

## Integration Examples

### With Express.js API
```javascript
const express = require('express');
const { identifyHybrid } = require('@trackid/youtube-track-recogniser');

const app = express();

app.get('/identify', async (req, res) => {
  try {
    const { url, method = 'hybrid' } = req.query;
    
    let result;
    if (method === 'hybrid') {
      result = await identifyHybrid(url, { mode: 'quick' });
    } else {
      result = await identify(url, { mode: 'quick' });
    }
    
    res.json(result || { error: 'No track identified' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### With Discord Bot
```javascript
const { Client } = require('discord.js');
const { identifyHybrid } = require('@trackid/youtube-track-recogniser');

client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!identify ')) {
    const url = message.content.slice(10);
    try {
      const result = await identifyHybrid(url);
      if (result && result.artist) {
        let reply = `🎵 **${result.artist}** - *${result.title}*`;
        
        // Add confidence and source info
        reply += `\n📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`;
        reply += `\n🔧 Source: ${result.source}`;
        
        if (result.agreement) {
          reply += ' ✅ (Verified by both audio and comments!)';
        }
        
        message.reply(reply);
      } else {
        message.reply('❌ Could not identify this track');
      }
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  }
});
```

## Related Packages

- `@trackid/music-recogniser` - Core music recognition functionality
- `@dj-tools/youtube-tracklist` - Extract full tracklists from comments
- `yt-dlp-wrap` - Node.js wrapper for yt-dlp

## License

MIT