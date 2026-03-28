const { MusicRecogniser } = require('../../music-recogniser/src');
const { YouTubeTracklistExtractor } = require('@dj-tools/youtube-tracklist');
const YouTubeService = require('./YouTubeService');

/**
 * YouTube Setlist Recogniser
 * 
 * Handles YouTube DJ sets, mixes, and long-form music content.
 * Unlike youtube-track-recogniser, this is designed for MULTIPLE tracks.
 * 
 * Features:
 * - Processes long videos (40+ minutes)
 * - Extracts full tracklists from DJ sets
 * - Combines audio fingerprinting with comment analysis
 * - Generates timeline and cue points
 */
class YouTubeSetlistRecogniser {
  constructor(options = {}) {
    // Initialize YouTube service for audio/video handling
    this.youtubeService = new YouTubeService(options.youtube || {});
    
    // Initialize music recogniser for audio fingerprinting
    this.musicRecogniser = new MusicRecogniser({
      mode: options.mode || 'medium',
      ...options.musicRecogniser
    });
    
    this.options = {
      // Processing options
      mode: options.mode || 'medium',
      maxDuration: options.maxDuration || 7200, // 2 hours max (vs 1 hour for single tracks)
      
      // Setlist specific options
      segmentDuration: options.segmentDuration || 30, // Sample every 30 seconds
      minTrackDuration: options.minTrackDuration || 120, // Minimum 2 minutes per track
      
      // Comment analysis options
      useComments: options.useComments !== false,
      commentOptions: {
        maxComments: 1000, // More comments for longer videos
        minConfidence: 0.3, // Lower threshold for sets
        ...options.commentOptions
      },
      
      // Audio processing options
      useAudio: options.useAudio !== false, // Default: use audio fingerprinting
      audioSegmentDuration: options.audioSegmentDuration || 30, // Sample every 30 seconds
      maxAudioDuration: options.maxAudioDuration || 7200, // Max audio processing duration
      audioStrategy: options.audioStrategy || 'sequential', // sequential vs parallel
      audioMinConfidence: options.audioMinConfidence || 0.4, // Audio recognition threshold
      
      // Output options
      outputFormat: options.outputFormat || 'json',
      includeCuePoints: options.includeCuePoints !== false,
      includeTimeline: options.includeTimeline !== false,
      
      ...options
    };
  }

  /**
   * Main method to recognize a YouTube setlist
   * @param {string} url - YouTube URL
   * @param {Object} options - Override options
   * @returns {Promise<Object>} Recognized setlist with tracks and timeline
   */
  async recognize(url, options = {}) {
    const startTime = Date.now();
    const callOptions = { ...this.options, ...options };
    
    console.log('🎛️ YouTube Setlist Recognition Started');
    console.log(`📺 URL: ${url}`);
    console.log(`🎵 Processing mode: ${callOptions.mode}`);
    
    try {
      // Get video metadata
      const videoInfo = await this.youtubeService.getVideoInfo(url);
      console.log(`\n📹 Video: ${videoInfo.title}`);
      console.log(`⏱️  Duration: ${this.formatDuration(videoInfo.duration)}`);
      console.log(`📢 Channel: ${videoInfo.channel}`);
      
      // Check duration
      if (videoInfo.duration > callOptions.maxDuration) {
        throw new Error(`Video too long: ${this.formatDuration(videoInfo.duration)}. Max: ${this.formatDuration(callOptions.maxDuration)}`);
      }
      
      // Run both comment and audio analysis
      let commentTracks = [];
      let audioTracks = [];
      
      // Extract from comments (faster, run first)
      if (callOptions.useComments) {
        console.log('\n💬 Analyzing comments for tracklist...');
        commentTracks = await this.extractFromComments(url, callOptions);
        console.log(`✓ Found ${commentTracks.length} tracks in comments`);
      }
      
      // Extract from audio fingerprinting
      if (callOptions.useAudio) {
        console.log('\n🎧 Starting audio fingerprinting...');
        audioTracks = await this.extractFromAudio(url, callOptions);
        console.log(`✓ Found ${audioTracks.length} tracks from audio`);
      }
      
      // Merge and validate results
      const mergedResult = this.mergeTrackResults(commentTracks, audioTracks, callOptions);
      
      const result = {
        url: url,
        video: videoInfo,
        tracks: mergedResult.tracks,
        totalTracks: mergedResult.tracks.length,
        duration: videoInfo.duration,
        processingTime: Date.now() - startTime,
        source: mergedResult.source,
        format: callOptions.outputFormat,
        
        // Processing details
        processing: {
          commentsAnalyzed: callOptions.useComments,
          audioProcessed: callOptions.useAudio,
          commentsFound: commentTracks.length,
          audioTracksFound: audioTracks.length,
          hybridMatches: mergedResult.hybridMatches || 0,
          timeline: mergedResult.timeline || null
        }
      };
      
      console.log(`\n✅ Recognition complete!`);
      console.log(`📊 Found ${result.totalTracks} tracks`);
      console.log(`⏱️  Processing time: ${Math.round(result.processingTime / 1000)}s`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Setlist recognition error:', error.message);
      throw error;
    }
  }

  /**
   * Analyze a setlist without full processing (lightweight)
   * @param {string} url - YouTube URL
   * @param {Object} options - Override options
   * @returns {Promise<Object>} Basic analysis results
   */
  async analyze(url, options = {}) {
    console.log('🔍 Analyzing YouTube setlist...');
    
    try {
      const videoInfo = await this.youtubeService.getVideoInfo(url);
      
      return {
        url: url,
        title: videoInfo.title,
        channel: videoInfo.channel,
        duration: videoInfo.duration,
        durationFormatted: this.formatDuration(videoInfo.duration),
        estimatedTracks: Math.floor(videoInfo.duration / 180), // Estimate ~3 min per track
        uploadDate: videoInfo.upload_date,
        viewCount: videoInfo.view_count,
        description: videoInfo.description?.substring(0, 500),
        suitable: videoInfo.duration >= 600 // At least 10 minutes
      };
      
    } catch (error) {
      console.error('❌ Analysis error:', error.message);
      throw error;
    }
  }

  /**
   * Extract tracklist from comments using youtube-tracklist
   * @private
   */
  async extractFromComments(url, options) {
    try {
      const extractor = new YouTubeTracklistExtractor();
      const result = await extractor.extractTracklist(url, {
        maxComments: options.commentOptions.maxComments,
        minConfidence: options.commentOptions.minConfidence
      });
      
      if (result.tracks && result.tracks.length > 0) {
        // Add track numbers and format for setlist
        return result.tracks.map((track, index) => ({
          number: index + 1,
          artist: track.artist,
          title: track.title,
          confidence: track.confidence,
          timestamp: track.timestamp || null, // If available from comments
          source: 'comments'
        }));
      }
      
      return [];
      
    } catch (error) {
      console.warn('⚠️ Comment extraction failed:', error.message);
      return [];
    }
  }

  /**
   * Extract tracklist from audio using fingerprinting
   * @private
   */
  async extractFromAudio(url, options) {
    try {
      console.log('🎧 Starting audio fingerprinting...');
      
      // Download audio
      const { audioPath, metadata } = await this.youtubeService.downloadAudio(url);
      console.log(`✓ Downloaded audio: ${Math.round(metadata.duration / 60)}min`);
      
      // Generate intelligent sample points (max 100 samples)
      const maxSamples = Math.min(100, options.maxAudioSamples || 100);
      const samplePoints = this.generateIntelligentSamples(metadata.duration, maxSamples);
      console.log(`🧠 Using intelligent sampling: ${samplePoints.length} strategic samples (instead of ${Math.ceil(metadata.duration / options.audioSegmentDuration)} segments)`);
      
      const audioTracks = [];
      let lastRecognized = null;
      let currentTrack = null;
      let consecutiveSameTrack = 0;
      
      // Process intelligent samples
      for (let i = 0; i < samplePoints.length; i++) {
        const samplePoint = samplePoints[i];
        const progress = Math.round((i / samplePoints.length) * 100);
        
        process.stdout.write(`\r🎵 Sampling point ${i + 1}/${samplePoints.length} (${progress}%) - ${this.formatDuration(samplePoint.time)}`);
        
        try {
          // Use MusicRecogniser to identify this sample point
          const result = await this.musicRecogniser.identify(audioPath, {
            startTime: samplePoint.time,
            duration: 30, // Fixed 30s sample duration
            mode: options.mode
          });
          
          if (result && result.confidence >= options.audioMinConfidence) {
            const trackKey = `${result.artist}-${result.title}`.toLowerCase();
            
            // Check if this is the same track as before
            if (lastRecognized && lastRecognized.key === trackKey) {
              // Same track continues
              consecutiveSameTrack++;
              if (currentTrack) {
                currentTrack.endTime = samplePoint.time + 30; // Extend to end of current sample
                currentTrack.duration = currentTrack.endTime - currentTrack.startTime;
                currentTrack.confidence = Math.max(currentTrack.confidence, result.confidence); // Keep highest confidence
              }
              
              // Skip ahead if we've confirmed same track multiple times
              if (consecutiveSameTrack >= 3) {
                console.log(`\n⏭️  Skipping ahead - confirmed same track (${result.artist} - ${result.title})`);
                // Skip to next likely track change point
                const nextChangePoint = this.findNextLikelyChangePoint(samplePoints, i, samplePoint.time + 180); // Skip 3 minutes ahead
                if (nextChangePoint > i) {
                  i = nextChangePoint - 1; // -1 because loop will increment
                  consecutiveSameTrack = 0;
                }
              }
            } else {
              // New track detected
              if (currentTrack) {
                // Finalize previous track
                audioTracks.push(currentTrack);
                console.log(`\n✅ Track ${audioTracks.length}: ${currentTrack.artist} - ${currentTrack.title} [${this.formatDuration(currentTrack.startTime)}-${this.formatDuration(currentTrack.endTime)}]`);
              }
              
              // Start new track
              currentTrack = {
                number: audioTracks.length + 1,
                artist: result.artist,
                title: result.title,
                startTime: samplePoint.time,
                endTime: samplePoint.time + 30,
                duration: 30,
                confidence: result.confidence,
                source: 'audio',
                recognitionData: {
                  service: result.service || 'multiple',
                  services: result.services || [],
                  consensus: result.consensus_score || 0
                }
              };
              
              lastRecognized = { key: trackKey, result };
              consecutiveSameTrack = 0;
            }
          } else {
            // No recognition or low confidence 
            consecutiveSameTrack = 0;
          }
          
        } catch (sampleError) {
          console.warn(`\n⚠️  Sample ${i + 1} failed: ${sampleError.message}`);
        }
        
        // Small delay to avoid overwhelming APIs
        if (i < samplePoints.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Slightly longer delay
        }
      }
      
      // Finalize last track
      if (currentTrack && currentTrack.duration >= options.minTrackDuration) {
        audioTracks.push(currentTrack);
      }
      
      console.log(`\n✓ Audio fingerprinting complete: ${audioTracks.length} tracks identified`);
      
      // Clean up audio file unless keeping temp files
      if (!options.keepTempFiles) {
        await this.youtubeService.cleanupAudio(metadata.id);
      }
      
      return audioTracks;
      
    } catch (error) {
      console.error('\n❌ Audio extraction failed:', error.message);
      return [];
    }
  }

  /**
   * Generate intelligent sample points for audio recognition
   * @private
   */
  generateIntelligentSamples(totalDuration, maxSamples) {
    const samples = [];
    
    // Strategy: Use variable density sampling
    // More samples at the beginning/end, fewer in the middle for long tracks
    // Ensure we sample potential track boundaries
    
    if (totalDuration <= 300) {
      // Short video (5 min or less) - sample every 30 seconds
      for (let time = 30; time < totalDuration - 30; time += 30) {
        samples.push({ time, reason: 'regular' });
      }
    } else {
      // Longer video - intelligent distribution
      
      // 1. Always sample early (first 5 minutes) - more densely
      for (let time = 30; time < Math.min(300, totalDuration); time += 45) {
        samples.push({ time, reason: 'early_dense' });
      }
      
      // 2. Middle section - sparser sampling every 2-3 minutes
      const middleStart = 300;
      const middleEnd = totalDuration - 300;
      const middleInterval = Math.max(120, (middleEnd - middleStart) / (maxSamples * 0.6)); // 60% of samples for middle
      
      for (let time = middleStart; time < middleEnd; time += middleInterval) {
        samples.push({ time, reason: 'middle_sparse' });
      }
      
      // 3. End section - denser again (last 5 minutes)
      for (let time = Math.max(middleEnd, totalDuration - 300); time < totalDuration - 30; time += 60) {
        samples.push({ time, reason: 'end_dense' });
      }
      
      // 4. Add some random samples for variety
      const randomCount = Math.min(10, maxSamples - samples.length);
      for (let i = 0; i < randomCount; i++) {
        const randomTime = Math.random() * (totalDuration - 60) + 30;
        samples.push({ time: randomTime, reason: 'random' });
      }
    }
    
    // Sort by time and remove duplicates
    const uniqueSamples = samples
      .sort((a, b) => a.time - b.time)
      .filter((sample, index, arr) => 
        index === 0 || Math.abs(sample.time - arr[index - 1].time) > 20 // Min 20s apart
      )
      .slice(0, maxSamples); // Ensure we don't exceed max
    
    return uniqueSamples;
  }

  /**
   * Find the next likely track change point
   * @private
   */
  findNextLikelyChangePoint(samplePoints, currentIndex, minTime) {
    // Look for a sample point that's at least minTime away
    for (let i = currentIndex + 1; i < samplePoints.length; i++) {
      if (samplePoints[i].time >= minTime) {
        return i;
      }
    }
    // If no suitable point found, return halfway to the end
    return Math.min(samplePoints.length - 1, currentIndex + Math.floor((samplePoints.length - currentIndex) / 2));
  }

  /**
   * Merge results from comment and audio recognition
   * @private
   */
  mergeTrackResults(commentTracks, audioTracks, options) {
    const hasComments = commentTracks && commentTracks.length > 0;
    const hasAudio = audioTracks && audioTracks.length > 0;
    
    if (!hasComments && !hasAudio) {
      return {
        tracks: [],
        source: 'none',
        hybridMatches: 0,
        timeline: null
      };
    }
    
    if (hasAudio && !hasComments) {
      // Audio only
      return {
        tracks: audioTracks.map((track, index) => ({ ...track, number: index + 1 })),
        source: 'audio',
        hybridMatches: 0,
        timeline: this.generateTimeline(audioTracks)
      };
    }
    
    if (hasComments && !hasAudio) {
      // Comments only (current behavior)
      return {
        tracks: commentTracks,
        source: 'comments',
        hybridMatches: 0,
        timeline: null
      };
    }
    
    // Both sources available - perform hybrid analysis
    console.log('\n🔄 Performing hybrid validation...');
    
    const hybridTracks = [];
    let hybridMatches = 0;
    
    // Use audio tracks as primary source (more accurate timestamps)
    audioTracks.forEach((audioTrack, index) => {
      const matchingCommentTrack = this.findMatchingTrack(audioTrack, commentTracks);
      
      if (matchingCommentTrack) {
        // Cross-validated track
        hybridMatches++;
        hybridTracks.push({
          ...audioTrack,
          number: index + 1,
          source: 'hybrid',
          confidence: Math.max(audioTrack.confidence, matchingCommentTrack.confidence),
          validation: {
            audioConfidence: audioTrack.confidence,
            commentConfidence: matchingCommentTrack.confidence,
            commentContext: matchingCommentTrack.context || null,
            verified: true
          }
        });
        console.log(`✓ Verified: ${audioTrack.artist} - ${audioTrack.title}`);
      } else {
        // Audio-only track
        hybridTracks.push({
          ...audioTrack,
          number: index + 1,
          source: 'audio',
          validation: {
            audioConfidence: audioTrack.confidence,
            commentConfidence: 0,
            verified: false
          }
        });
      }
    });
    
    // Add comment-only tracks that weren't matched
    commentTracks.forEach((commentTrack) => {
      const alreadyMatched = hybridTracks.some(track => 
        this.tracksAreSimilar(track, commentTrack)
      );
      
      if (!alreadyMatched) {
        hybridTracks.push({
          ...commentTrack,
          number: hybridTracks.length + 1,
          source: 'comments',
          startTime: null,
          endTime: null,
          duration: null,
          validation: {
            audioConfidence: 0,
            commentConfidence: commentTrack.confidence,
            commentContext: commentTrack.context || null,
            verified: false
          }
        });
      }
    });
    
    console.log(`🤝 Hybrid analysis: ${hybridMatches}/${audioTracks.length} audio tracks verified by comments`);
    
    return {
      tracks: hybridTracks.sort((a, b) => (a.startTime || 0) - (b.startTime || 0)),
      source: 'hybrid',
      hybridMatches: hybridMatches,
      timeline: this.generateTimeline(hybridTracks.filter(t => t.startTime !== null))
    };
  }

  /**
   * Find matching track in comment tracks
   * @private
   */
  findMatchingTrack(audioTrack, commentTracks) {
    return commentTracks.find(commentTrack => 
      this.tracksAreSimilar(audioTrack, commentTrack)
    );
  }

  /**
   * Check if two tracks are similar (same song)
   * @private
   */
  tracksAreSimilar(track1, track2) {
    if (!track1 || !track2 || !track1.artist || !track1.title || !track2.artist || !track2.title) {
      return false;
    }
    
    const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    const artist1 = normalize(track1.artist);
    const title1 = normalize(track1.title);
    const artist2 = normalize(track2.artist);
    const title2 = normalize(track2.title);
    
    // Check for exact matches or high similarity
    const artistMatch = artist1 === artist2 || this.stringSimilarity(artist1, artist2) > 0.8;
    const titleMatch = title1 === title2 || this.stringSimilarity(title1, title2) > 0.8;
    
    return artistMatch && titleMatch;
  }

  /**
   * Calculate string similarity (Levenshtein-based)
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
   * Calculate Levenshtein distance
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
   * Generate timeline from audio tracks
   * @private
   */
  generateTimeline(audioTracks) {
    if (!audioTracks || audioTracks.length === 0) {
      return null;
    }
    
    return audioTracks
      .filter(track => track.startTime !== null && track.endTime !== null)
      .map(track => ({
        track: `${track.artist} - ${track.title}`,
        startTime: this.formatDuration(track.startTime),
        endTime: this.formatDuration(track.endTime),
        duration: this.formatDuration(track.duration || 0)
      }))
      .sort((a, b) => a.startTime - b.startTime);
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
   * Check if yt-dlp is available
   * @returns {Promise<boolean>} True if available
   */
  async checkDependencies() {
    return await this.youtubeService.checkYtDlpAvailability();
  }
}

module.exports = YouTubeSetlistRecogniser;