const { MusicRecogniser, identify } = require('../src/index.js');

async function basicExample() {
  console.log('🎵 Basic Music Recognition Example');
  console.log('=====================================\n');

  try {
    // Method 1: Using the convenience function
    console.log('1. Using convenience function:');
    const result1 = await identify('./path/to/audio.mp3', {
      services: ['shazam'],  // Only use Shazam for this example
      quickMode: true
    });

    if (result1) {
      console.log(`✓ Found: ${result1.artist} - ${result1.title}`);
      console.log(`  Confidence: ${result1.confidence.toFixed(2)}`);
      console.log(`  Service: ${result1.service}`);
    } else {
      console.log('✗ No track identified');
    }

    // Method 2: Using MusicRecognizer class
    console.log('\n2. Using MusicRecognizer class:');
    const recognizer = new MusicRecogniser({
      // Configure with your API keys
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

    const result2 = await recognizer.identify('./path/to/audio.mp3');

    if (result2) {
      console.log(`✓ Found: ${result2.artist} - ${result2.title}`);
      console.log(`  Confidence: ${result2.confidence.toFixed(2)}`);
      console.log(`  Processing time: ${result2.processing_time_ms}ms`);
      
      if (result2.external_ids) {
        console.log('  External IDs:');
        Object.entries(result2.external_ids).forEach(([platform, id]) => {
          console.log(`    ${platform}: ${id}`);
        });
      }
    } else {
      console.log('✗ No track identified');
    }

    // Method 3: Using audio buffer
    console.log('\n3. Using audio buffer:');
    const fs = require('fs');
    const audioBuffer = fs.readFileSync('./path/to/audio.wav');
    
    const result3 = await recognizer.identify(audioBuffer);
    
    if (result3) {
      console.log(`✓ Found: ${result3.artist} - ${result3.title}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  basicExample();
}

module.exports = basicExample;