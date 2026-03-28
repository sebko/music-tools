#!/usr/bin/env node

const { Command } = require('commander');
const { identifyHybrid, identify, identifyFromComments } = require('./index.js');

const program = new Command();

program
  .name('youtube-track-recogniser')
  .description('Recognize single tracks from YouTube videos using audio fingerprinting and comment analysis')
  .version('1.0.0');

program
  .command('recognize')
  .description('Recognize track from YouTube video (uses both audio and comments by default)')
  .argument('<url>', 'YouTube video URL or video ID')
  .option('-m, --mode <type>', 'Recognition intensity mode (low|medium|high)', 'medium')
  .option('--audio-only', 'Use only audio fingerprinting (no comments)')
  .option('--comments-only', 'Use only comment analysis (no audio)')
  .option('--max-comments <number>', 'Maximum comments to analyze', '500')
  .option('--min-confidence <number>', 'Minimum confidence threshold (0-1)', '0.4')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (url, options) => {
    try {
      console.log('🎯 YouTube Track Recognition Starting...\n');
      
      let result;
      
      if (options.audioOnly) {
        console.log('🎧 Using audio fingerprinting only...');
        result = await identify(url, {
          mode: options.mode
        });
      } else if (options.commentsOnly) {
        console.log('💬 Using comment analysis only...');
        result = await identifyFromComments(url, {
          maxComments: parseInt(options.maxComments),
          minConfidence: parseFloat(options.minConfidence)
        });
      } else {
        console.log('🔄 Using hybrid recognition (audio + comments)...');
        result = await identifyHybrid(url, {
          mode: options.mode,
          commentOptions: {
            maxComments: parseInt(options.maxComments),
            minConfidence: parseFloat(options.minConfidence)
          }
        });
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Make 'recognize' the default command when no command is specified
program
  .arguments('<url>')
  .option('-m, --mode <type>', 'Recognition intensity mode (low|medium|high)', 'medium')
  .option('--audio-only', 'Use only audio fingerprinting (no comments)')
  .option('--comments-only', 'Use only comment analysis (no audio)')
  .option('--max-comments <number>', 'Maximum comments to analyze', '500')
  .option('--min-confidence <number>', 'Minimum confidence threshold (0-1)', '0.4')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (url, options) => {
    // Same logic as the recognize command
    try {
      console.log('🎯 YouTube Track Recognition Starting...\n');
      
      let result;
      
      if (options.audioOnly) {
        console.log('🎧 Using audio fingerprinting only...');
        result = await identify(url, {
          mode: options.mode
        });
      } else if (options.commentsOnly) {
        console.log('💬 Using comment analysis only...');
        result = await identifyFromComments(url, {
          maxComments: parseInt(options.maxComments),
          minConfidence: parseFloat(options.minConfidence)
        });
      } else {
        console.log('🔄 Using hybrid recognition (audio + comments)...');
        result = await identifyHybrid(url, {
          mode: options.mode,
          commentOptions: {
            maxComments: parseInt(options.maxComments),
            minConfidence: parseFloat(options.minConfidence)
          }
        });
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Setup API keys and dependencies')
  .action(() => {
    console.log('🔑 YouTube Track Recogniser Setup\n');
    console.log('You need the following API keys and dependencies:\n');
    
    console.log('1. YouTube Data API v3 Key:');
    console.log('   - Go to: https://console.cloud.google.com/');
    console.log('   - Enable YouTube Data API v3');
    console.log('   - Create credentials (API Key)');
    console.log('   - Set: YOUTUBE_API_KEY="your_key_here"\n');
    
    console.log('2. Anthropic Claude API Key (for comment analysis):');
    console.log('   - Go to: https://console.anthropic.com/');
    console.log('   - Create an API key');
    console.log('   - Set: ANTHROPIC_API_KEY="your_key_here"\n');
    
    console.log('3. Music Recognition APIs (at least one required):');
    console.log('   - Shazam (via RapidAPI): RAPIDAPI_SHAZAM_KEY');
    console.log('   - AudD.io: AUDD_API_KEY');
    console.log('   - ACRCloud: ACRCLOUD_ACCESS_KEY\n');
    
    console.log('4. yt-dlp (for audio download):');
    console.log('   - Install: pip install yt-dlp\n');
    
    console.log('You can create a .env file in your project root with these keys.');
  });

function printResult(result) {
  if (!result || !result.artist) {
    console.log('\n❌ No track identified');
    if (result?.error) {
      console.log(`   Error: ${result.error}`);
    }
    return;
  }

  // Show individual service results if available
  if (result.individual_results && result.individual_results.length > 0) {
    console.log('\n🔍 Service Results:');
    result.individual_results.forEach(serviceResult => {
      const confidence = Math.round((serviceResult.confidence || 0) * 100);
      console.log(`   ✓ ${serviceResult.service}: ${serviceResult.artist} - ${serviceResult.title} (${confidence}% confidence)`);
    });

    // Also show services that failed if we know the total number tried
    const servicesToShow = ['shazam', 'audd', 'acrcloud'];
    const foundServices = result.individual_results.map(r => r.service);
    const missedServices = servicesToShow.filter(s => !foundServices.includes(s));
    
    missedServices.forEach(service => {
      console.log(`   ✗ ${service}: No match found`);
    });
    
    // Show consensus information if available
    if (result.consensus_score !== undefined) {
      const consensusPercent = Math.round(result.consensus_score * 100);
      const serviceCount = result.services ? result.services.length : result.individual_results.length;
      const totalServices = result.total_services || 3;
      console.log(`\n🤝 Consensus: ${serviceCount}/${totalServices} services agree (${consensusPercent}% consensus)`);
    } else if (result.services && result.services.length > 1) {
      console.log(`\n🤝 Multiple services confirmed this result`);
    }
  }

  console.log('\n🎵 Best Match:');
  console.log('='.repeat(50));
  console.log(`🎤 Artist: ${result.artist}`);
  console.log(`🎧 Title: ${result.title}`);
  console.log(`📊 Confidence: ${Math.round(result.confidence * 100)}%`);
  console.log(`🔧 Source: ${result.source}`);

  // Show hybrid-specific information
  if (result.agreement !== undefined) {
    if (result.agreement) {
      console.log('🤝 VALIDATED: Both audio and comments agree!');
    } else if (result.commentsFound) {
      console.log('⚠️  CONFLICT: Audio and comments disagree');
      console.log(`   Audio says: ${result.artist} - ${result.title}`);
      console.log(`   Comments say: ${result.commentsFound.artist} - ${result.commentsFound.title}`);
    }
  }

  // Show processing details
  if (result.processing) {
    console.log('\n📈 Processing Details:');
    console.log(`   Audio Recognition: ${result.processing.audio_success ? '✅' : '❌'}`);
    console.log(`   Comment Analysis: ${result.processing.comments_success ? '✅' : '❌'}`);
    console.log(`   Total Time: ${Math.round(result.processing.total_time_ms / 1000)}s`);
  }

  // Show YouTube metadata
  if (result.youtube) {
    console.log('\n📺 YouTube Info:');
    console.log(`   Title: ${result.youtube.title}`);
    console.log(`   Channel: ${result.youtube.channel}`);
    console.log(`   Duration: ${formatDuration(result.youtube.duration)}`);
  }

  // Show comment context if available
  if (result.commentsFound?.context) {
    console.log('\n💬 Comment Context:');
    const context = result.commentsFound.context.substring(0, 100);
    console.log(`   "${context}${result.commentsFound.context.length > 100 ? '...' : ''}"`);
    
    // Show alternatives if available
    if (result.commentsFound.alternatives && result.commentsFound.alternatives.length > 0) {
      console.log(`\n🔀 Alternative Names: ${result.commentsFound.alternatives.join(', ')}`);
    }
  }

  // Show alternate matches if available
  if (result.alternateMatches && result.alternateMatches.length > 0) {
    console.log('\n🔍 Other Possible Matches:');
    result.alternateMatches.slice(0, 3).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.artist} - ${match.title} (${Math.round(match.confidence * 100)}%)`);
    });
  }
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program.parse();