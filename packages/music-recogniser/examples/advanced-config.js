const { MusicRecognizer } = require('@trackid/music-recognition');

async function advancedExample() {
  console.log('🎯 Advanced Music Recognition Example');
  console.log('======================================\n');

  try {
    // Create recognizer with advanced configuration
    const recognizer = new MusicRecognizer({
      // Service selection
      services: ['shazam', 'audd', 'acrcloud'],
      useAllServices: true,  // Use all available services for consensus

      // Recognition behavior
      consensusThreshold: 0.8,  // Higher threshold for better accuracy
      timeout: 45000,  // 45 second timeout
      quickMode: false,  // Don't exit early, try all samples
      confidenceThreshold: 0.9,  // High confidence threshold

      // Audio processing
      segmentDuration: 15,  // Longer segments for better recognition
      samplePoints: [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95],  // More sample points
      maxAttempts: 7,  // Try more samples

      // Output options
      includeRawResults: true,  // Include raw API responses
      includeAlternateMatches: true,  // Show alternate matches

      // Audio processor configuration
      audio: {
        tempDir: './temp-audio',
        segmentDuration: 15,
        overlapDuration: 3
      },

      // Service-specific configuration
      shazam: {
        apiKey: process.env.RAPIDAPI_SHAZAM_KEY,
        host: process.env.RAPIDAPI_SHAZAM_HOST
      },
      audd: {
        apiKey: process.env.AUDD_API_KEY
      },
      acrcloud: {
        host: process.env.ACRCLOUD_HOST,
        accessKey: process.env.ACRCLOUD_ACCESS_KEY,
        accessSecret: process.env.ACRCLOUD_ACCESS_SECRET
      }
    });

    // Example 1: Multi-service recognition with consensus
    console.log('1. Multi-service recognition with consensus:');
    const result1 = await recognizer.identify('./path/to/audio.mp3');

    if (result1) {
      console.log(`✓ Found: ${result1.artist} - ${result1.title}`);
      console.log(`  Confidence: ${result1.confidence.toFixed(2)}`);
      console.log(`  Consensus Score: ${result1.consensus_score?.toFixed(2) || 'N/A'}`);
      console.log(`  Services Used: ${result1.services_used?.join(', ') || result1.service}`);
      
      if (result1.individual_results) {
        console.log('  Individual Results:');
        result1.individual_results.forEach(r => {
          console.log(`    ${r.service}: ${r.artist} - ${r.title} (${r.confidence.toFixed(2)})`);
        });
      }

      if (result1.alternate_matches && result1.alternate_matches.length > 0) {
        console.log('  Alternate Matches:');
        result1.alternate_matches.forEach((match, i) => {
          console.log(`    ${i + 1}. ${match.artist} - ${match.title} (${match.confidence.toFixed(2)})`);
        });
      }

      if (result1.recognized_segment) {
        console.log(`  Recognized from: ${(result1.recognized_segment.sample_point * 100).toFixed(0)}% through track`);
      }
    }

    // Example 2: Single service recognition
    console.log('\n2. Single service recognition (Shazam):');
    const result2 = await recognizer.identifyWithService('./path/to/audio.mp3', 'shazam');
    
    if (result2) {
      console.log(`✓ Shazam found: ${result2.artist} - ${result2.title}`);
      console.log(`  Shazam Key: ${result2.external_ids?.shazam || 'N/A'}`);
    }

    // Example 3: Text search
    console.log('\n3. Text search example:');
    const searchResults = await recognizer.searchTracks('Darude Sandstorm');
    
    if (searchResults.length > 0) {
      console.log(`✓ Found ${searchResults.length} search results:`);
      searchResults.slice(0, 3).forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.artist} - ${result.title}`);
      });
    }

    // Example 4: Usage statistics
    console.log('\n4. Usage statistics:');
    const stats = await recognizer.getUsageStats();
    
    console.log('Service Usage:');
    Object.entries(stats.services).forEach(([service, usage]) => {
      if (usage.error) {
        console.log(`  ${service}: Error - ${usage.error}`);
      } else {
        console.log(`  ${service}: ${usage.daily_usage || 0}/${usage.daily_limit || 'unlimited'} daily`);
      }
    });

    // Example 5: Custom recognition options per call
    console.log('\n5. Custom options per call:');
    const result5 = await recognizer.identify('./path/to/audio.mp3', {
      quickMode: true,  // Override global setting
      services: ['audd'],  // Use only AudD for this call
      confidenceThreshold: 0.7  // Lower threshold for this call
    });

    if (result5) {
      console.log(`✓ Quick recognition: ${result5.artist} - ${result5.title}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Handle specific errors
    if (error.message.includes('FFmpeg')) {
      console.log('💡 Tip: Install FFmpeg to process audio files');
    } else if (error.message.includes('configured')) {
      console.log('💡 Tip: Make sure to set your API keys in environment variables');
    }
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  advancedExample();
}

module.exports = advancedExample;