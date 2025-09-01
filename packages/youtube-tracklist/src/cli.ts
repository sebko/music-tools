#!/usr/bin/env node

import { Command } from 'commander';
import { YouTubeTracklistExtractor } from './index.js';

const program = new Command();

program
  .name('youtube-tracklist')
  .description('Extract tracklists from YouTube video comments using AI')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract tracklist from a YouTube video')
  .argument('<url>', 'YouTube video URL or video ID')
  .option('-c, --max-comments <number>', 'Maximum number of comments to process', '1000')
  .option('-m, --min-confidence <number>', 'Minimum confidence threshold (0-1)', '0.3')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (url, options) => {
    try {
      console.log('🎵 Extracting tracklist from YouTube comments...\n');
      
      const extractor = new YouTubeTracklistExtractor();
      const result = await extractor.extractTracklist(url, {
        maxComments: parseInt(options.maxComments),
        minConfidence: parseFloat(options.minConfidence),
      });

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printTable(result);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Setup API keys')
  .action(() => {
    console.log('🔑 API Keys Setup\n');
    console.log('You need two API keys to use this tool:\n');
    console.log('1. YouTube Data API v3 Key:');
    console.log('   - Go to: https://console.cloud.google.com/');
    console.log('   - Enable YouTube Data API v3');
    console.log('   - Create credentials (API Key)');
    console.log('   - Set: export YOUTUBE_API_KEY="your_key_here"\n');
    console.log('2. Anthropic Claude API Key:');
    console.log('   - Go to: https://console.anthropic.com/');
    console.log('   - Create an API key');
    console.log('   - Set: export ANTHROPIC_API_KEY="your_key_here"\n');
    console.log('You can also create a .env file in your project root with these keys.');
  });

function printTable(result: any): void {
  console.log(`📊 Extraction Results for Video: ${result.metadata.videoId}\n`);
  
  if (result.tracks.length === 0) {
    console.log('❌ No tracks found in the comments.');
    return;
  }

  console.log(`Found ${result.tracks.length} tracks:\n`);
  
  // Print header
  console.log('Time'.padEnd(8) + 'Artist'.padEnd(25) + 'Title'.padEnd(30) + 'Confidence');
  console.log('-'.repeat(75));
  
  // Print tracks
  for (const track of result.tracks) {
    const time = track.timestamp || '—';
    const artist = truncate(track.artist, 24);
    const title = truncate(track.title, 29);
    const confidence = `${Math.round(track.confidence * 100)}%`;
    
    console.log(
      time.padEnd(8) + 
      artist.padEnd(25) + 
      title.padEnd(30) + 
      confidence
    );
  }
  
  console.log('\n📈 Metadata:');
  console.log(`  Total Comments: ${result.metadata.totalComments}`);
  console.log(`  Processed: ${result.metadata.processedComments}`);
  console.log(`  API Calls: ${result.metadata.apiCalls}`);
}

function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length - 1) + '…' : str;
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program.parse();