const { YouTubeTrackRecogniser, identify, identifyHybrid, identifyFromComments, getVideoInfo } = require('../src/index.js');

async function basicExample() {
  console.log('🎵 YouTube Single Track Recognition - Basic Usage');
  console.log('==========================================');
  console.log('NOTE: This package is for SINGLE TRACKS only.\n');

  // Example YouTube URLs
  const exampleUrls = [
    'https://www.youtube.com/watch?v=EFUx9jd7maM&list=RDEFUx9jd7maM&start_radio=1',
    'https://youtu.be/dQw4w9WgXcQ', // Rick Roll for testing
  ];

  try {
    // Method 1: Using convenience function (Quick mode)
    console.log('1. Quick Recognition (convenience function):');
    console.log('=' .repeat(50));
    
    const result1 = await identify(exampleUrls[0], { mode: 'quick' });
    
    if (result1 && result1.artist) {
      console.log(`✅ Found: ${result1.artist} - ${result1.title}`);
      console.log(`📊 Confidence: ${result1.confidence.toFixed(2)}`);
      console.log(`⏱️  Time: ${Math.round(result1.processing.total_time_ms / 1000)}s`);
      console.log(`📺 YouTube: ${result1.youtube.title} by ${result1.youtube.channel}`);
    } else {
      console.log('❌ No track identified');
    }

    // Method 2: Hybrid Recognition (RECOMMENDED for single tracks)
    console.log('\n2. Hybrid Recognition (Audio + Comments):');
    console.log('=' .repeat(50));
    
    const hybridResult = await identifyHybrid(exampleUrls[1], { 
      mode: 'quick',
      preferAudioResult: true
    });
    
    if (hybridResult && hybridResult.artist) {
      console.log(`✅ Found: ${hybridResult.artist} - ${hybridResult.title}`);
      console.log(`📊 Confidence: ${hybridResult.confidence.toFixed(2)}`);
      console.log(`🔧 Source: ${hybridResult.source}`);
      console.log(`🤝 Agreement: ${hybridResult.agreement ? 'Yes' : 'No'}`);
      
      if (hybridResult.commentsFound) {
        console.log(`💬 Comments found: ${hybridResult.commentsFound.artist} - ${hybridResult.commentsFound.title}`);
        console.log(`   Context: "${hybridResult.commentsFound.context.substring(0, 60)}..."`);
      }
      
      console.log(`⏱️  Processing: Audio(${hybridResult.processing.audio_success}), Comments(${hybridResult.processing.comments_success})`);
    } else {
      console.log('❌ No track identified by either method');
      if (hybridResult.error) {
        console.log(`   Error: ${hybridResult.error}`);
      }
    }

    // Method 3: Using class with HAM mode
    console.log('\n3. HAM Mode Recognition (class usage):');
    console.log('=' .repeat(50));
    
    const recogniser = new YouTubeTrackRecogniser({
      mode: 'ham',
      keepTempFiles: false,  // Clean up temp files
      musicRecogniser: {
        includeAlternateMatches: true
      }
    });

    const result2 = await recogniser.identify(exampleUrls[0]);
    
    if (result2 && result2.artist) {
      console.log(`✅ Found: ${result2.artist} - ${result2.title}`);
      console.log(`📊 Confidence: ${result2.confidence.toFixed(2)}`);
      console.log(`🎯 Mode: ${result2.processing.mode_used}`);
      console.log(`🔧 Services: ${result2.services_used?.join(', ') || result2.service}`);
      
      if (result2.external_ids) {
        console.log('🔗 External links:');
        Object.entries(result2.external_ids).forEach(([platform, id]) => {
          console.log(`  ${platform}: ${id}`);
        });
      }
    }

    // Method 4: Just get video info without recognition
    console.log('\n4. Video Information Only:');
    console.log('=' .repeat(50));
    
    const videoInfo = await getVideoInfo(exampleUrls[0]);
    console.log(`📺 Title: ${videoInfo.title}`);
    console.log(`📺 Channel: ${videoInfo.channel}`);
    console.log(`⏱️  Duration: ${recogniser.formatDuration(videoInfo.duration)}`);
    console.log(`👀 Views: ${videoInfo.view_count?.toLocaleString() || 'Unknown'}`);
    console.log(`📅 Upload Date: ${videoInfo.upload_date}`);

    // Method 5: Custom configuration
    console.log('\n5. Custom Configuration:');
    console.log('=' .repeat(50));
    
    const customRecogniser = new YouTubeTrackRecogniser({
      mode: 'ultra',  // Most thorough mode
      maxDuration: 1800,  // 30 minutes max
      audioQuality: '192',  // Higher quality
      musicRecogniser: {
        consensusThreshold: 0.9,  // Very high confidence required
        includeRawResults: true
      }
    });

    // Check if we can process the video (within duration limit)
    if (videoInfo.duration <= 1800) {
      console.log('⚡ Processing with ULTRA mode (high quality, high confidence)...');
      
      const result4 = await customRecogniser.identify(exampleUrls[0]);
      
      if (result4 && result4.artist) {
        console.log(`✅ ULTRA result: ${result4.artist} - ${result4.title}`);
        console.log(`📊 Confidence: ${result4.confidence.toFixed(3)}`);
        console.log(`🎖️  Consensus: ${result4.consensus_score?.toFixed(3) || 'N/A'}`);
      }
    } else {
      console.log(`⚠️  Video too long for ULTRA mode (${recogniser.formatDuration(videoInfo.duration)})`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Common error help
    if (error.message.includes('yt-dlp')) {
      console.log('\n💡 Install yt-dlp:');
      console.log('   pip install yt-dlp');
      console.log('   # or');
      console.log('   brew install yt-dlp  # on macOS');
    } else if (error.message.includes('configured')) {
      console.log('\n💡 Set up API keys:');
      console.log('   export RAPIDAPI_SHAZAM_KEY=your_key');
      console.log('   export AUDD_API_KEY=your_key');
      console.log('   export ACRCLOUD_HOST=your_host');
      console.log('   export ACRCLOUD_ACCESS_KEY=your_key');
      console.log('   export ACRCLOUD_ACCESS_SECRET=your_secret');
    }
  }
}

// Example of checking system requirements
async function checkRequirements() {
  console.log('\n🔧 System Requirements Check:');
  console.log('=' .repeat(50));
  
  const recogniser = new YouTubeTrackRecogniser();
  
  // Check yt-dlp
  const ytDlpAvailable = await recogniser.checkYtDlpAvailability();
  console.log(`yt-dlp: ${ytDlpAvailable ? '✅ Available' : '❌ Not installed'}`);
  
  // Check music recogniser services
  const { MusicRecogniser } = require('../../music-recogniser/src');
  const musicRecogniser = new MusicRecogniser();
  const services = musicRecogniser.getAvailableServices();
  
  console.log(`Music recognition services: ${services.length > 0 ? '✅' : '❌'} ${services.length} configured`);
  services.forEach(s => {
    console.log(`  - ${s.name}: ✅`);
  });
  
  if (services.length === 0) {
    console.log('  ⚠️  No recognition services configured. Set API keys in environment.');
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  checkRequirements().then(() => basicExample());
}

module.exports = basicExample;