#!/usr/bin/env node

const { Command } = require('commander');
const { recognizeSetlist, analyzeSetlist } = require('./index.js');
require('dotenv').config();

const program = new Command();

program
  .name('youtube-setlist-recogniser')
  .description('Recognize and extract tracklists from YouTube DJ sets and mixes')
  .version('1.0.0');

// Main command - organize a setlist
program
  .command('recognize')
  .description('Extract and recognize tracklist from a YouTube DJ set or mix')
  .argument('<url>', 'YouTube video URL')
  .option('-m, --mode <type>', 'Recognition intensity (low|medium|high)', 'medium')
  .option('--max-comments <number>', 'Max comments to analyze', '1000')
  .option('--no-comments', 'Skip comment analysis')
  .option('--no-audio', 'Skip audio fingerprinting')
  .option('--audio-only', 'Use only audio fingerprinting (skip comments)')
  .option('--segment-duration <seconds>', 'Audio segment duration for sampling', '30')
  .option('--max-audio-samples <number>', 'Maximum audio samples to process', '100')
  .option('--audio-strategy <type>', 'Audio processing strategy (sequential|parallel)', 'sequential')
  .option('-f, --format <type>', 'Output format (json|text|cue)', 'text')
  .action(async (url, options) => {
    try {
      console.log('🎛️ Starting YouTube Setlist Recognition...\n');
      
      const result = await recognizeSetlist(url, {
        mode: options.mode,
        useComments: options.audioOnly ? false : options.comments,
        useAudio: options.audio,
        audioSegmentDuration: parseInt(options.segmentDuration),
        maxAudioSamples: parseInt(options.maxAudioSamples),
        audioStrategy: options.audioStrategy,
        commentOptions: {
          maxComments: parseInt(options.maxComments)
        },
        outputFormat: options.format
      });

      // Output results based on format
      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printSetlist(result);
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Analyze command - lightweight analysis
program
  .command('analyze')
  .description('Quick analysis of a YouTube video for setlist suitability')
  .argument('<url>', 'YouTube video URL')
  .action(async (url) => {
    try {
      console.log('🔍 Analyzing video...\n');
      
      const analysis = await analyzeSetlist(url);
      
      console.log('📊 Video Analysis:');
      console.log('='.repeat(50));
      console.log(`📺 Title: ${analysis.title}`);
      console.log(`📢 Channel: ${analysis.channel}`);
      console.log(`⏱️  Duration: ${analysis.durationFormatted}`);
      console.log(`🎵 Estimated tracks: ~${analysis.estimatedTracks}`);
      console.log(`👁️  Views: ${analysis.viewCount?.toLocaleString() || 'N/A'}`);
      console.log(`📅 Upload date: ${analysis.uploadDate}`);
      console.log(`✅ Suitable for processing: ${analysis.suitable ? 'Yes' : 'No (too short)'}`);
      
      if (analysis.description) {
        console.log(`\n📝 Description preview:`);
        console.log(analysis.description);
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Default command when no subcommand specified
program
  .arguments('<url>')
  .option('-m, --mode <type>', 'Recognition intensity (low|medium|high)', 'medium')
  .option('--max-comments <number>', 'Max comments to analyze', '1000')
  .option('--no-comments', 'Skip comment analysis')
  .option('--no-audio', 'Skip audio fingerprinting')
  .option('--audio-only', 'Use only audio fingerprinting (skip comments)')
  .option('--segment-duration <seconds>', 'Audio segment duration for sampling', '30')
  .option('--max-audio-samples <number>', 'Maximum audio samples to process', '100')
  .option('--audio-strategy <type>', 'Audio processing strategy (sequential|parallel)', 'sequential')
  .option('-f, --format <type>', 'Output format (json|text|cue)', 'text')
  .action(async (url, options) => {
    try {
      console.log('🎛️ Starting YouTube Setlist Recognition...\n');
      
      const result = await recognizeSetlist(url, {
        mode: options.mode,
        useComments: options.audioOnly ? false : options.comments,
        useAudio: options.audio,
        audioSegmentDuration: parseInt(options.segmentDuration),
        maxAudioSamples: parseInt(options.maxAudioSamples),
        audioStrategy: options.audioStrategy,
        commentOptions: {
          maxComments: parseInt(options.maxComments)
        },
        outputFormat: options.format
      });

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printSetlist(result);
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Setup command for dependencies
program
  .command('setup')
  .description('Check dependencies and setup instructions')
  .action(async () => {
    console.log('🔧 YouTube Setlist Recogniser Setup\n');
    console.log('Required dependencies and API keys:\n');
    
    console.log('1. YouTube Data API v3:');
    console.log('   Set: YOUTUBE_API_KEY="your_key"');
    console.log('   Get from: https://console.cloud.google.com/\n');
    
    console.log('2. Anthropic Claude API (for AI extraction):');
    console.log('   Set: ANTHROPIC_API_KEY="your_key"');
    console.log('   Get from: https://console.anthropic.com/\n');
    
    console.log('3. yt-dlp (for video/audio handling):');
    console.log('   Install: pip install yt-dlp\n');
    
    console.log('4. Optional - Music Recognition APIs:');
    console.log('   - Shazam: RAPIDAPI_SHAZAM_KEY');
    console.log('   - AudD: AUDD_API_KEY');
    console.log('   - ACRCloud: ACRCLOUD_ACCESS_KEY\n');
    
    // Check if yt-dlp is available
    const { YouTubeSetlistRecogniser } = require('./index.js');
    const recogniser = new YouTubeSetlistRecogniser();
    const hasYtDlp = await recogniser.checkDependencies();
    
    console.log('Status:');
    console.log(`✅ yt-dlp: ${hasYtDlp ? 'Installed' : 'Not found - please install'}`);
    console.log(`${process.env.YOUTUBE_API_KEY ? '✅' : '❌'} YouTube API Key: ${process.env.YOUTUBE_API_KEY ? 'Set' : 'Not set'}`);
    console.log(`${process.env.ANTHROPIC_API_KEY ? '✅' : '❌'} Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`);
  });

/**
 * Print formatted setlist
 */
function printSetlist(result) {
  console.log('\n🎵 Setlist Results:');
  console.log('='.repeat(60));
  
  // Video info
  console.log(`\n📺 Video: ${result.video.title}`);
  console.log(`📢 Channel: ${result.video.channel}`);
  console.log(`⏱️  Duration: ${formatDuration(result.video.duration)}`);
  console.log(`🔍 Source: ${result.source}`);
  
  // Tracklist
  if (result.tracks && result.tracks.length > 0) {
    console.log(`\n📊 Found ${result.totalTracks} tracks:\n`);
    
    result.tracks.forEach(track => {
      const confidence = Math.round(track.confidence * 100);
      const timestamp = track.timestamp ? ` [${track.timestamp}]` : '';
      const timeRange = track.startTime && track.endTime ? 
        ` [${formatDuration(track.startTime)}-${formatDuration(track.endTime)}]` : timestamp;
      const sourceIcon = track.source === 'hybrid' ? '🤝' : 
                        track.source === 'audio' ? '🎧' : 
                        track.source === 'comments' ? '💬' : '📝';
      
      console.log(`${track.number.toString().padStart(2, '0')}. ${sourceIcon} ${track.artist} - ${track.title}${timeRange} (${confidence}%)`);
    });
    
    // Show timeline if available
    if (result.processing?.timeline && result.processing.timeline.length > 0) {
      console.log('\n⏰ Timeline:');
      result.processing.timeline.forEach(entry => {
        console.log(`   ${entry.startTime} - ${entry.track}`);
      });
    }
  } else {
    console.log('\n❌ No tracks found');
  }
  
  // Processing info
  if (result.processing) {
    console.log('\n📈 Processing Details:');
    console.log(`   Comments analyzed: ${result.processing.commentsAnalyzed ? '✅' : '❌'} (${result.processing.commentsFound || 0} found)`);
    console.log(`   Audio processed: ${result.processing.audioProcessed ? '✅' : '❌'} (${result.processing.audioTracksFound || 0} found)`);
    if (result.processing.hybridMatches > 0) {
      console.log(`   Hybrid matches: ${result.processing.hybridMatches} tracks verified by both sources`);
    }
  }
  
  console.log(`\n⏱️  Processing time: ${Math.round(result.processingTime / 1000)}s`);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled error:', reason);
  process.exit(1);
});

program.parse();