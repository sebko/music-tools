const { MusicRecogniser } = require('../../music-recogniser/src');
const { YouTubeTracklistExtractor } = require('@dj-tools/youtube-tracklist');
const YouTubeService = require('./YouTubeService');

/**
 * YouTube Track Recogniser
 * 
 * Handles SINGLE YouTube tracks using two methods:
 * 1. Audio fingerprinting (downloads audio and uses music-recogniser)
 * 2. Comment analysis (uses youtube-tracklist to check comments)
 * 
 * NOTE: This class is designed for SINGLE TRACK recognition only.
 * For DJ mixes, live sets, or multi-track content, use @dj-tools/youtube-tracklist.
 */
class YouTubeTrackRecogniser {
  constructor(options = {}) {
    // Initialize YouTube service for audio download
    this.youtubeService = new YouTubeService(options.youtube || {});
    
    // Initialize music recogniser with intensity mode and options
    this.musicRecogniser = new MusicRecogniser({
      mode: options.mode || 'quick',
      ...options.musicRecogniser
    });
    
    this.options = {
      // Default intensity mode
      mode: options.mode || 'quick',
      
      // YouTube processing options
      maxDuration: options.maxDuration || 3600, // 1 hour max
      audioQuality: options.audioQuality || '128',
      keepTempFiles: options.keepTempFiles || false,
      
      // Hybrid recognition options
      useComments: options.useComments !== false, // Default true
      preferAudioResult: options.preferAudioResult !== false, // Default true
      commentOptions: {
        maxComments: 500,
        minConfidence: 0.4,
        ...options.commentOptions
      },
      
      // Recognition options (passed to music-recogniser)
      ...options
    };
  }

  /**
   * Identify track from YouTube URL
   * @param {string} url - YouTube URL
   * @param {Object} options - Override options for this recognition
   * @returns {Promise<Object|null>} Recognition result with YouTube metadata
   */
  async identify(url, options = {}) {
    const startTime = Date.now();
    
    // Merge options for this call
    const callOptions = { ...this.options, ...options };
    
    console.log('🎯 YouTube Track Recognition Started');
    console.log(`📺 URL: ${url}`);
    console.log(`🔥 Mode: ${callOptions.mode || this.options.mode}`);
    
    let audioPath = null;
    
    try {
      // Step 1: Download audio from YouTube
      console.log('\n📥 Step 1: Downloading audio...');
      const { audioPath: downloadedPath, metadata } = await this.youtubeService.downloadAudio(url);
      audioPath = downloadedPath;
      
      console.log(`✓ Downloaded: ${metadata.title}`);
      console.log(`  Duration: ${this.formatDuration(metadata.duration)}`);
      console.log(`  Channel: ${metadata.channel}`);
      
      // Step 2: Recognize track using music-recogniser
      console.log('\n🎵 Step 2: Recognizing audio...');
      
      // Create music recogniser with call-specific options
      const recogniser = new MusicRecogniser({
        mode: callOptions.mode,
        ...callOptions.musicRecogniser
      });
      
      const result = await recogniser.identify(audioPath, callOptions);
      
      if (result) {
        // Enhance result with YouTube metadata
        const enhancedResult = {
          ...result,
          
          // YouTube source info
          source: 'youtube',
          youtube: {
            url: url,
            id: metadata.id,
            title: metadata.title,
            channel: metadata.channel,
            duration: metadata.duration,
            upload_date: metadata.upload_date,
            view_count: metadata.view_count
          },
          
          // Processing info
          processing: {
            total_time_ms: Date.now() - startTime,
            recognition_time_ms: result.processing_time_ms,
            download_time_ms: (Date.now() - startTime) - (result.processing_time_ms || 0),
            mode_used: callOptions.mode || this.options.mode
          }
        };
        
        console.log(`\n✅ SUCCESS: Found track!`);
        console.log(`🎵 ${result.artist} - ${result.title}`);
        console.log(`📊 Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`⏱️  Total time: ${Math.round((Date.now() - startTime) / 1000)}s`);
        
        return enhancedResult;
      } else {
        console.log('\n❌ No track identified');
        console.log(`⏱️  Total time: ${Math.round((Date.now() - startTime) / 1000)}s`);
        
        return {
          source: 'youtube',
          result: null,
          youtube: {
            url: url,
            id: metadata.id,
            title: metadata.title,
            channel: metadata.channel,
            duration: metadata.duration
          },
          processing: {
            total_time_ms: Date.now() - startTime,
            mode_used: callOptions.mode || this.options.mode
          }
        };
      }
      
    } catch (error) {
      console.error('\n❌ YouTube recognition error:', error.message);
      
      // Handle specific error types
      if (error.message.includes('Video too long')) {
        throw new Error(`Video exceeds maximum duration of ${this.formatDuration(this.options.maxDuration)}`);
      } else if (error.message.includes('Download failed')) {
        throw new Error(`Failed to download YouTube audio: ${error.message}`);
      } else if (error.message.includes('yt-dlp')) {
        throw new Error('yt-dlp is required but not available. Please install yt-dlp.');
      }
      
      throw error;
      
    } finally {
      // Cleanup temp files unless requested to keep them
      if (audioPath && !callOptions.keepTempFiles) {
        await this.cleanup([audioPath]);
      }
    }
  }

  /**
   * Identify track from comments only (single track focus)
   * @param {string} url - YouTube URL
   * @param {Object} options - Override options for this recognition
   * @returns {Promise<Object|null>} Recognition result from comments
   */
  async identifyFromComments(url, options = {}) {
    const startTime = Date.now();
    const callOptions = { ...this.options.commentOptions, ...options.commentOptions };
    
    console.log('💬 Analyzing comments for single track...');
    
    try {
      // Use youtube-tracklist to extract from comments
      const extractor = new YouTubeTracklistExtractor();
      const result = await extractor.extractTracklist(url, callOptions);
      
      // For single track, we expect only one track or take the highest confidence
      if (result.tracks && result.tracks.length > 0) {
        // Sort by confidence and take the best match
        const bestTrack = result.tracks.sort((a, b) => b.confidence - a.confidence)[0];
        
        console.log(`✓ Found from comments: ${bestTrack.artist} - ${bestTrack.title}`);
        console.log(`📊 Confidence: ${bestTrack.confidence.toFixed(2)}`);
        
        return {
          artist: bestTrack.artist,
          title: bestTrack.title,
          confidence: bestTrack.confidence,
          source: 'comments',
          context: bestTrack.context,
          language: bestTrack.language,
          processing_time_ms: Date.now() - startTime,
          comment_metadata: result.metadata
        };
      } else {
        console.log('❌ No tracks found in comments');
        return null;
      }
      
    } catch (error) {
      console.warn('⚠️ Comment analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Hybrid identification: combines audio fingerprinting with comment analysis
   * @param {string} url - YouTube URL
   * @param {Object} options - Override options for this recognition
   * @returns {Promise<Object>} Enhanced recognition result with both methods
   */
  async identifyHybrid(url, options = {}) {
    const startTime = Date.now();
    const callOptions = { ...this.options, ...options };
    
    console.log('🔄 Starting hybrid recognition (audio + comments)...');
    console.log(`📺 URL: ${url}`);
    console.log(`🔥 Mode: ${callOptions.mode || this.options.mode}`);
    
    // Run both methods in parallel for single track
    const [audioResult, commentResult] = await Promise.allSettled([
      this.identify(url, callOptions).catch(err => ({ error: err.message })),
      callOptions.useComments ? this.identifyFromComments(url, callOptions).catch(err => null) : Promise.resolve(null)
    ]);
    
    // Extract results
    const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;
    const comments = commentResult.status === 'fulfilled' ? commentResult.value : null;
    
    // Merge results
    const mergedResult = this.mergeResults(audio, comments, url, startTime, callOptions);
    
    console.log(`\n📊 Hybrid Recognition Complete:`);
    console.log(`🎵 Result: ${mergedResult.artist || 'Unknown'} - ${mergedResult.title || 'Unknown'}`);
    console.log(`📈 Confidence: ${mergedResult.confidence?.toFixed(2) || 'N/A'}`);
    console.log(`🔧 Source: ${mergedResult.source}`);
    console.log(`⏱️ Total time: ${Math.round((Date.now() - startTime) / 1000)}s`);
    
    return mergedResult;
  }

  /**
   * Merge results from audio and comment recognition
   * @private
   */
  mergeResults(audioResult, commentResult, url, startTime, options) {
    const hasAudio = audioResult && !audioResult.error && audioResult.artist;
    const hasComments = commentResult && commentResult.artist;
    
    // Determine agreement
    let agreement = false;
    if (hasAudio && hasComments) {
      agreement = this.tracksMatch(audioResult, commentResult);
    }
    
    let primaryResult, source;
    
    if (hasAudio && hasComments) {
      // Both methods succeeded
      if (options.preferAudioResult) {
        primaryResult = audioResult;
        source = agreement ? 'both' : 'audio';
      } else {
        // Compare confidence scores
        primaryResult = audioResult.confidence >= commentResult.confidence ? audioResult : commentResult;
        source = agreement ? 'both' : (primaryResult === audioResult ? 'audio' : 'comments');
      }
    } else if (hasAudio) {
      // Audio only
      primaryResult = audioResult;
      source = 'audio';
    } else if (hasComments) {
      // Comments only
      primaryResult = commentResult;
      source = 'comments';
    } else {
      // Neither method succeeded
      return {
        artist: null,
        title: null,
        confidence: 0,
        source: 'none',
        error: 'No track identified by either method',
        processing: {
          total_time_ms: Date.now() - startTime,
          methods_used: options.useComments ? ['audio', 'comments'] : ['audio'],
          audio_failed: audioResult?.error || false,
          comments_failed: !hasComments
        }
      };
    }
    
    // Enhance primary result with hybrid data
    return {
      ...primaryResult,
      source: source,
      agreement: agreement,
      
      // Cross-validation data
      commentsFound: hasComments ? {
        artist: commentResult.artist,
        title: commentResult.title,
        confidence: commentResult.confidence,
        context: commentResult.context,
        matchesAudio: agreement
      } : null,
      
      // Enhanced processing info
      processing: {
        ...primaryResult.processing,
        total_time_ms: Date.now() - startTime,
        methods_used: options.useComments ? ['audio', 'comments'] : ['audio'],
        audio_success: hasAudio,
        comments_success: hasComments,
        agreement: agreement
      }
    };
  }

  /**
   * Check if two track results match (same song)
   * @private
   */
  tracksMatch(track1, track2) {
    if (!track1 || !track2) return false;
    
    const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    const artist1 = normalize(track1.artist);
    const title1 = normalize(track1.title);
    const artist2 = normalize(track2.artist);
    const title2 = normalize(track2.title);
    
    // Check for exact matches or close similarity
    const artistMatch = artist1 === artist2 || this.stringSimilarity(artist1, artist2) > 0.8;
    const titleMatch = title1 === title2 || this.stringSimilarity(title1, title2) > 0.8;
    
    return artistMatch && titleMatch;
  }

  /**
   * Calculate string similarity (simple implementation)
   * @private
   */
  stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @private
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get video information without processing
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoInfo(url) {
    return await this.youtubeService.getVideoInfo(url);
  }

  /**
   * Test different intensity modes on the same video
   * @param {string} url - YouTube URL
   * @param {Array} modes - Array of modes to test ['quick', 'ham', 'ultra']
   * @returns {Promise<Object>} Results from all modes
   */
  async testIntensityModes(url, modes = ['quick', 'ham', 'ultra']) {
    console.log(`🧪 Testing ${modes.length} intensity modes on: ${url}`);
    
    const results = {};
    
    for (const mode of modes) {
      console.log(`\n🔥 Testing ${mode.toUpperCase()} mode:`);
      console.log('='.repeat(50));
      
      try {
        const startTime = Date.now();
        const result = await this.identify(url, { mode, keepTempFiles: true });
        const endTime = Date.now();
        
        results[mode] = {
          ...result,
          test_duration_ms: endTime - startTime
        };
        
        console.log(`✓ ${mode.toUpperCase()} completed in ${Math.round((endTime - startTime) / 1000)}s`);
        
      } catch (error) {
        console.error(`❌ ${mode.toUpperCase()} failed:`, error.message);
        results[mode] = {
          error: error.message,
          mode: mode
        };
      }
    }
    
    // Summary
    console.log('\n📊 INTENSITY MODE COMPARISON:');
    console.log('='.repeat(50));
    
    modes.forEach(mode => {
      const result = results[mode];
      if (result.error) {
        console.log(`${mode.toUpperCase()}: ❌ ${result.error}`);
      } else if (result.result === null) {
        console.log(`${mode.toUpperCase()}: ❌ No track found (${Math.round(result.test_duration_ms / 1000)}s)`);
      } else {
        console.log(`${mode.toUpperCase()}: ✅ ${result.artist} - ${result.title} (${result.confidence.toFixed(2)} confidence, ${Math.round(result.test_duration_ms / 1000)}s)`);
      }
    });
    
    return results;
  }

  /**
   * Format duration in seconds to readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Clean up temporary files
   * @param {Array} filePaths - Array of file paths to delete
   */
  async cleanup(filePaths) {
    const fs = require('fs');
    
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Cleaned up: ${filePath}`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not delete temp file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Check if yt-dlp is available
   * @returns {Promise<boolean>} True if yt-dlp is available
   */
  async checkYtDlpAvailability() {
    return await this.youtubeService.checkYtDlpAvailability();
  }
}

module.exports = YouTubeTrackRecogniser;