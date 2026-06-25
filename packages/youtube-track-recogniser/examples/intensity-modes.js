const { testModes, identify } = require('@trackid/youtube-track-recogniser');

async function testIntensityModes() {
  console.log('🎯 YouTube Track Recognition - Intensity Mode Testing');
  console.log('====================================================\n');

  // Test URL (provided by user)
  const testUrl = 'https://www.youtube.com/watch?v=EFUx9jd7maM&list=RDEFUx9jd7maM&start_radio=1';

  try {
    console.log('📺 Testing URL:', testUrl);
    console.log('\nThis will test all three intensity modes and compare results:\n');
    
    // Test all intensity modes
    const results = await testModes(testUrl, ['low', 'medium', 'high']);
    
    console.log('\n🏆 FINAL RESULTS SUMMARY:');
    console.log('='.repeat(60));
    
    let bestResult = null;
    let bestMode = null;
    let bestConfidence = 0;
    
    // Analyze results
    ['low', 'medium', 'high'].forEach(mode => {
      const result = results[mode];
      
      if (result.error) {
        console.log(`❌ ${mode.toUpperCase()}: Failed - ${result.error}`);
      } else if (!result.artist) {
        console.log(`❌ ${mode.toUpperCase()}: No track found (${Math.round(result.test_duration_ms / 1000)}s)`);
      } else {
        const confidence = result.confidence || 0;
        console.log(`✅ ${mode.toUpperCase()}: ${result.artist} - ${result.title}`);
        console.log(`   Confidence: ${confidence.toFixed(3)} | Time: ${Math.round(result.test_duration_ms / 1000)}s | Services: ${result.services_used?.join(', ') || result.service}`);
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestResult = result;
          bestMode = mode;
        }
      }
    });
    
    if (bestResult) {
      console.log('\n🎖️  BEST RESULT:');
      console.log(`Mode: ${bestMode.toUpperCase()}`);
      console.log(`Track: ${bestResult.artist} - ${bestResult.title}`);
      console.log(`Confidence: ${bestResult.confidence.toFixed(3)}`);
      console.log(`Processing time: ${Math.round(bestResult.test_duration_ms / 1000)}s`);
      
      if (bestResult.youtube) {
        console.log(`YouTube title: ${bestResult.youtube.title}`);
        console.log(`Channel: ${bestResult.youtube.channel}`);
      }
      
      if (bestResult.external_ids) {
        console.log('External IDs:');
        Object.entries(bestResult.external_ids).forEach(([platform, id]) => {
          console.log(`  ${platform}: ${id}`);
        });
      }
    } else {
      console.log('\n😞 No successful recognition from any mode');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('yt-dlp')) {
      console.log('\n💡 Install yt-dlp: pip install yt-dlp');
    } else if (error.message.includes('configured')) {
      console.log('\n💡 Set your API keys in environment variables:');
      console.log('   RAPIDAPI_SHAZAM_KEY=your_key');
      console.log('   AUDD_API_KEY=your_key');
      console.log('   ACRCLOUD_HOST=your_host');
      console.log('   ACRCLOUD_ACCESS_KEY=your_key');
      console.log('   ACRCLOUD_ACCESS_SECRET=your_secret');
    }
  }
}

async function singleModeExample() {
  console.log('\n\n🎯 Single Mode Example (HAM Mode)');
  console.log('==================================\n');

  const testUrl = 'https://www.youtube.com/watch?v=EFUx9jd7maM&list=RDEFUx9jd7maM&start_radio=1';

  try {
    const result = await identify(testUrl, { 
      mode: 'medium',  // Use medium mode for good balance of speed vs accuracy
      includeAlternateMatches: true 
    });

    if (result && result.artist) {
      console.log('✅ Successfully identified track:');
      console.log(`🎵 ${result.artist} - ${result.title}`);
      console.log(`📊 Confidence: ${result.confidence.toFixed(3)}`);
      console.log(`⏱️  Processing time: ${Math.round(result.processing.total_time_ms / 1000)}s`);
      console.log(`🔧 Mode: ${result.processing.mode_used}`);
      
      if (result.alternate_matches && result.alternate_matches.length > 0) {
        console.log(`\n🎭 Alternate matches found:`);
        result.alternate_matches.forEach((match, i) => {
          console.log(`  ${i + 1}. ${match.artist} - ${match.title} (${match.confidence.toFixed(3)})`);
        });
      }
    } else {
      console.log('❌ Could not identify the track');
    }

  } catch (error) {
    console.error('❌ Recognition failed:', error.message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  testIntensityModes().then(() => singleModeExample());
}

module.exports = { testIntensityModes, singleModeExample };