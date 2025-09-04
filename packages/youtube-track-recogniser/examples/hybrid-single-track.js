const { identifyHybrid, identifyFromComments, identify } = require('../src/index.js');

/**
 * Hybrid Recognition Example for Single Tracks
 * 
 * Demonstrates how to combine audio fingerprinting with comment analysis
 * for better accuracy when identifying single YouTube tracks.
 */
async function hybridExample() {
  console.log('🔄 Hybrid Single Track Recognition Example');
  console.log('==========================================');
  console.log('This example shows how audio and comments work together for single tracks.\n');

  // Example URLs - single track videos
  const exampleUrls = [
    'https://youtu.be/dQw4w9WgXcQ',  // Rick Roll - well-known track
    'https://youtu.be/fJ9rUzIMcZQ',  // Another popular track
  ];

  for (const [index, url] of exampleUrls.entries()) {
    console.log(`\n🎵 Example ${index + 1}: ${url}`);
    console.log('='.repeat(60));

    try {
      // Method 1: Hybrid approach (recommended)
      console.log('\n1. Hybrid Recognition (Audio + Comments):');
      console.log('-'.repeat(40));
      
      const hybridResult = await identifyHybrid(url, {
        mode: 'low',
        preferAudioResult: true,
        commentOptions: {
          maxComments: 300,
          minConfidence: 0.4
        }
      });

      if (hybridResult.artist) {
        console.log(`✅ RESULT: ${hybridResult.artist} - ${hybridResult.title}`);
        console.log(`📊 Confidence: ${hybridResult.confidence.toFixed(2)}`);
        console.log(`🔧 Source: ${hybridResult.source}`);
        
        if (hybridResult.agreement) {
          console.log('🤝 VALIDATED: Both audio and comments agree!');
        } else if (hybridResult.commentsFound) {
          console.log('⚠️  CONFLICT: Audio and comments disagree');
          console.log(`   Audio says: ${hybridResult.artist} - ${hybridResult.title}`);
          console.log(`   Comments say: ${hybridResult.commentsFound.artist} - ${hybridResult.commentsFound.title}`);
        }

        // Show processing details
        console.log('\n📈 Processing Details:');
        console.log(`   Audio Recognition: ${hybridResult.processing.audio_success ? '✅' : '❌'}`);
        console.log(`   Comment Analysis: ${hybridResult.processing.comments_success ? '✅' : '❌'}`);
        console.log(`   Total Time: ${Math.round(hybridResult.processing.total_time_ms / 1000)}s`);

        // Show comment context if found
        if (hybridResult.commentsFound && hybridResult.commentsFound.context) {
          console.log(`\n💬 Comment Context:`);
          console.log(`   "${hybridResult.commentsFound.context.substring(0, 80)}${hybridResult.commentsFound.context.length > 80 ? '...' : ''}"`);
        }

      } else {
        console.log('❌ No track identified by either method');
        if (hybridResult.error) {
          console.log(`   Error: ${hybridResult.error}`);
        }
      }

      // Method 2: Compare individual methods
      console.log('\n2. Method Comparison:');
      console.log('-'.repeat(40));

      // Audio only
      try {
        console.log('🎧 Audio Recognition:');
        const audioResult = await identify(url, { mode: 'low' });
        if (audioResult && audioResult.artist) {
          console.log(`   ✅ ${audioResult.artist} - ${audioResult.title} (${audioResult.confidence.toFixed(2)})`);
        } else {
          console.log('   ❌ No match');
        }
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
      }

      // Comments only
      try {
        console.log('💬 Comment Analysis:');
        const commentResult = await identifyFromComments(url, {
          maxComments: 300,
          minConfidence: 0.4
        });
        if (commentResult && commentResult.artist) {
          console.log(`   ✅ ${commentResult.artist} - ${commentResult.title} (${commentResult.confidence.toFixed(2)})`);
        } else {
          console.log('   ❌ No match');
        }
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
      }

      // Show which method is more reliable for this track
      if (hybridResult.artist) {
        if (hybridResult.source === 'both') {
          console.log('🎯 RECOMMENDATION: Both methods agree - highest confidence!');
        } else if (hybridResult.source === 'audio') {
          console.log('🎯 RECOMMENDATION: Audio recognition was more reliable');
        } else if (hybridResult.source === 'comments') {
          console.log('🎯 RECOMMENDATION: Comments were more informative');
        }
      }

    } catch (error) {
      console.error(`❌ Example ${index + 1} failed:`, error.message);
    }
  }

  // Summary and best practices
  console.log('\n\n📋 Best Practices for Single Track Recognition:');
  console.log('='.repeat(50));
  console.log('• Use identifyHybrid() for best results');
  console.log('• Audio recognition works best for popular/commercial tracks');
  console.log('• Comments help with rare/unreleased tracks or when audio fails');
  console.log('• When both methods agree, confidence is very high');
  console.log('• Set preferAudioResult: true for most reliable primary result');
  console.log('• Adjust commentOptions.minConfidence based on your needs');
  console.log('\n🚫 Remember: This package is for SINGLE TRACKS only!');
  console.log('   For DJ mixes or multi-track content, use @dj-tools/youtube-tracklist');
}

// Configuration examples
async function configurationExample() {
  console.log('\n\n⚙️  Configuration Examples');
  console.log('========================\n');

  const url = 'https://youtu.be/dQw4w9WgXcQ';

  // High accuracy configuration
  console.log('1. High Accuracy Setup (slower but more thorough):');
  const highAccuracyResult = await identifyHybrid(url, {
    mode: 'high',                    // Most thorough audio recognition
    preferAudioResult: false,         // Compare confidence scores
    commentOptions: {
      maxComments: 1000,              // Check more comments
      minConfidence: 0.3              // Lower threshold for comments
    },
    musicRecogniser: {
      consensusThreshold: 0.9,        // Require high consensus
      includeAlternateMatches: true
    }
  });

  if (highAccuracyResult.artist) {
    console.log(`   Result: ${highAccuracyResult.artist} - ${highAccuracyResult.title}`);
    console.log(`   Source: ${highAccuracyResult.source}`);
  }

  // Fast configuration
  console.log('\n2. Fast Recognition (low intensity):');
  const fastResult = await identifyHybrid(url, {
    mode: 'low',                    // Fastest audio recognition
    preferAudioResult: true,          // Trust audio first
    commentOptions: {
      maxComments: 200,               // Fewer comments to check
      minConfidence: 0.6              // Higher threshold
    }
  });

  if (fastResult.artist) {
    console.log(`   Result: ${fastResult.artist} - ${fastResult.title}`);
    console.log(`   Time: ${Math.round(fastResult.processing.total_time_ms / 1000)}s`);
  }
}

// Run examples
if (require.main === module) {
  (async () => {
    try {
      await hybridExample();
      await configurationExample();
    } catch (error) {
      console.error('Example failed:', error.message);
      
      // Helpful error messages
      if (error.message.includes('yt-dlp')) {
        console.log('\n💡 Install yt-dlp: pip install yt-dlp');
      } else if (error.message.includes('API key')) {
        console.log('\n💡 Set up API keys in .env file or environment variables');
      }
    }
  })();
}

module.exports = { hybridExample, configurationExample };