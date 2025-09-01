# @trackid/music-recognition

A powerful, standalone Node.js package for single track music identification using multiple recognition services (Shazam, AudD, ACRCloud).

## Features

🎯 **Multi-Service Recognition** - Supports Shazam, AudD, and ACRCloud with consensus validation  
🎵 **Strategic Audio Sampling** - Samples audio at multiple points for better accuracy  
⚡ **Quick Mode** - Early exit on high-confidence matches  
🔄 **Cross-Reference Validation** - Uses consensus algorithms for reliable results  
📊 **Confidence Scoring** - Weighted confidence scores from multiple services  
🎚️ **Audio Processing** - Built-in audio segmentation and format conversion  
💾 **TypeScript Support** - Full TypeScript definitions included  

## Installation

```bash
npm install @trackid/music-recognition
```

### Prerequisites

- **Node.js** 16.0.0 or higher
- **FFmpeg** (required for audio processing)

#### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from [FFmpeg official site](https://ffmpeg.org/download.html)

## Quick Start

```javascript
const { identify } = require('@trackid/music-recognition');

// Simple identification
const result = await identify('./path/to/audio.mp3');

if (result) {
  console.log(`Found: ${result.artist} - ${result.title}`);
  console.log(`Confidence: ${result.confidence}`);
}
```

## API Configuration

Set up your API keys as environment variables:

```bash
# Shazam (via RapidAPI)
RAPIDAPI_SHAZAM_KEY=your_rapidapi_key
RAPIDAPI_SHAZAM_HOST=shazam.p.rapidapi.com

# AudD
AUDD_API_KEY=your_audd_api_key

# ACRCloud
ACRCLOUD_HOST=your_acrcloud_host
ACRCLOUD_ACCESS_KEY=your_access_key
ACRCLOUD_ACCESS_SECRET=your_access_secret
```

## Basic Usage

### Using the Main Class

```javascript
const { MusicRecognizer } = require('@trackid/music-recognition');

const recognizer = new MusicRecognizer({
  // Service selection
  services: ['shazam', 'audd', 'acrcloud'],
  useAllServices: true,
  
  // Recognition behavior
  quickMode: true,
  confidenceThreshold: 0.85,
  consensusThreshold: 0.7,
  
  // API keys (optional if using env vars)
  shazam: { apiKey: 'your_key' },
  audd: { apiKey: 'your_key' },
  acrcloud: {
    host: 'your_host',
    accessKey: 'your_key',
    accessSecret: 'your_secret'
  }
});

// Identify from file
const result = await recognizer.identify('./audio.mp3');

// Identify from buffer
const fs = require('fs');
const buffer = fs.readFileSync('./audio.wav');
const result2 = await recognizer.identify(buffer);
```

### Single Service Recognition

```javascript
// Use specific service
const result = await recognizer.identifyWithService('./audio.mp3', 'shazam');
```

### Text Search

```javascript
// Search for tracks by text (Shazam only)
const results = await recognizer.searchTracks('Darude Sandstorm');
```

## Advanced Configuration

```javascript
const recognizer = new MusicRecognizer({
  // Service configuration
  services: ['shazam', 'audd', 'acrcloud'],
  useAllServices: true,
  
  // Recognition behavior
  consensusThreshold: 0.8,
  timeout: 45000,
  quickMode: false,
  confidenceThreshold: 0.9,
  
  // Audio processing
  segmentDuration: 15,
  samplePoints: [0.1, 0.3, 0.5, 0.7, 0.9],
  maxAttempts: 5,
  
  // Output options
  includeRawResults: true,
  includeAlternateMatches: true,
  
  // Audio processor settings
  audio: {
    tempDir: './temp',
    segmentDuration: 10,
    overlapDuration: 2
  }
});
```

## Recognition Result Format

```javascript
{
  service: 'shazam',
  title: 'Sandstorm',
  artist: 'Darude',
  album: 'Before the Storm',
  confidence: 0.95,
  duration: 230,
  
  // Multi-service results
  services_used: ['shazam', 'audd'],
  consensus_score: 0.87,
  individual_results: [
    { service: 'shazam', confidence: 0.95, title: 'Sandstorm', artist: 'Darude' },
    { service: 'audd', confidence: 0.89, title: 'Sandstorm', artist: 'Darude' }
  ],
  
  // External platform IDs
  external_ids: {
    spotify: '4uLU6hMCjMI75M1A2tKUQC',
    apple_music: '1440896540',
    shazam: '54321'
  },
  
  // Additional metadata
  genres: 'Electronic',
  label: 'Sony Music',
  release_date: '1999-10-01',
  isrc: 'FI0000000001',
  
  // Processing info
  processing_time_ms: 1250,
  recognized_segment: {
    sample_point: 0.5,
    start_time: 115,
    duration: 10
  },
  
  // Alternate matches (if enabled)
  alternate_matches: [...]
}
```

## Individual Services

### Using Services Directly

```javascript
const { ShazamService, AudDService, ACRCloudService } = require('@trackid/music-recognition');

// Shazam
const shazam = new ShazamService({ apiKey: 'your_key' });
const result1 = await shazam.identifyTrack('./audio.mp3');
const search = await shazam.searchTracks('Darude Sandstorm');

// AudD
const audd = new AudDService({ apiKey: 'your_key' });
const result2 = await audd.identifyTrack('./audio.mp3');
const lyrics = await audd.findLyrics('Darude', 'Sandstorm');
const usage = await audd.getUsage();

// ACRCloud
const acrcloud = new ACRCloudService({
  host: 'your_host',
  accessKey: 'your_key',
  accessSecret: 'your_secret'
});
const result3 = await acrcloud.identifyTrack('./audio.mp3');
```

## Audio Processing

```javascript
const { AudioProcessor } = require('@trackid/music-recognition');

const processor = new AudioProcessor({
  tempDir: './temp',
  segmentDuration: 10
});

// Get audio duration
const duration = await processor.getAudioDuration('./audio.mp3');

// Create strategic samples
const samples = await processor.createStrategicSamples(
  './audio.mp3',
  [0.1, 0.3, 0.5, 0.7, 0.9],  // Sample points
  10  // Segment duration
);

// Extract specific segment
const segment = await processor.extractSegment('./audio.mp3', 30, 10);

// Convert audio format
const converted = await processor.convertAudio('./audio.mp3', {
  format: 'wav',
  sampleRate: 44100,
  channels: 1
});

// Clean up temp files
await processor.cleanup([segment, converted]);
```

## Utility Functions

```javascript
const { 
  calculateStringSimilarity, 
  areResultsSimilar,
  groupSimilarResults,
  crossReferenceResults
} = require('@trackid/music-recognition');

// String similarity (0-1)
const similarity = calculateStringSimilarity('Sandstorm', 'Sand Storm');

// Check if results are similar
const similar = areResultsSimilar(result1, result2, 0.8);

// Group similar results
const groups = groupSimilarResults(results, 0.8);

// Cross-reference results with consensus
const best = crossReferenceResults(results, 3, 0.7);
```

## Error Handling

```javascript
try {
  const result = await recognizer.identify('./audio.mp3');
} catch (error) {
  if (error.message.includes('FFmpeg')) {
    console.log('Please install FFmpeg');
  } else if (error.message.includes('configured')) {
    console.log('Please set your API keys');
  } else {
    console.error('Recognition error:', error.message);
  }
}
```

## Performance Tips

1. **Use Quick Mode** for faster results when high confidence is acceptable
2. **Limit Services** to reduce API calls and processing time
3. **Strategic Sampling** works better than full audio processing for single tracks
4. **Cache Results** to avoid repeated recognition of the same audio
5. **Batch Process** multiple files to optimize temporary file usage

## Service Comparison

| Service | Pros | Cons | Best For |
|---------|------|------|----------|
| **Shazam** | Fast, accurate, extensive database | Limited to popular music | Commercial tracks |
| **AudD** | Good metadata, usage tracking | Requires credits | Detailed metadata needs |
| **ACRCloud** | Humming recognition, fingerprints | More complex setup | Advanced audio analysis |

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Support

- [GitHub Issues](https://github.com/your-org/trackid/issues)
- [Documentation](https://github.com/your-org/trackid/tree/main/packages/music-recognition)
- [Examples](./examples/)

---

**Related Packages:**
- `@trackid/youtube-processor` - YouTube audio extraction
- `@trackid/dj-set-analyzer` - DJ set tracklist generation