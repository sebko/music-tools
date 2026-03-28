const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * YouTube Service for setlist organiser
 * Handles video info retrieval and audio download for long-form content
 */
class YouTubeService {
  constructor(options = {}) {
    this.ytDlpWrap = new YTDlpWrap();
    this.tempDir = options.tempDir || process.env.AUDIO_TEMP_DIR || './temp';
    this.maxDuration = parseInt(options.maxDuration || process.env.MAX_SETLIST_LENGTH) || 7200; // 2 hours
    this.audioQuality = options.audioQuality || process.env.AUDIO_QUALITY || '128';
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get video information without downloading
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoInfo(url) {
    try {
      const args = [
        url,
        '--print', 'title',
        '--print', 'duration',
        '--print', 'id',
        '--print', 'uploader',
        '--print', 'description',
        '--print', 'upload_date',
        '--print', 'view_count',
        '--print', 'channel',
        '--no-playlist',
        '--no-warnings'
      ];
      
      const output = await this.ytDlpWrap.execPromise(args);
      const lines = output.trim().split('\n');
      
      return {
        title: lines[0] || 'Unknown',
        duration: parseInt(lines[1]) || 0,
        id: lines[2] || '',
        uploader: lines[3] || 'Unknown',
        description: lines[4] || '',
        upload_date: lines[5] || '',
        view_count: parseInt(lines[6]) || 0,
        channel: lines[7] || 'Unknown',
        url: url
      };
      
    } catch (error) {
      console.error('Error getting video info:', error.message);
      throw error;
    }
  }

  /**
   * Download audio from YouTube (for future audio fingerprinting)
   * @param {string} url - YouTube URL
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Audio path and metadata
   */
  async downloadAudio(url, options = {}) {
    try {
      const videoInfo = await this.getVideoInfo(url);
      
      if (videoInfo.duration > this.maxDuration) {
        throw new Error(`Video too long: ${videoInfo.duration}s (max: ${this.maxDuration}s)`);
      }

      const outputPath = path.join(this.tempDir, `${videoInfo.id}_audio.wav`);
      
      // Check if already downloaded
      if (fs.existsSync(outputPath)) {
        console.log('ℹ️  Audio already cached');
        return { audioPath: outputPath, metadata: videoInfo };
      }

      console.log('📥 Downloading audio...');
      
      const downloadArgs = [
        url,
        '-x', // Extract audio
        '--audio-format', 'wav',
        '--audio-quality', this.audioQuality,
        '-o', outputPath,
        '--no-playlist'
      ];
      
      await this.ytDlpWrap.execPromise(downloadArgs);
      
      console.log('✓ Audio downloaded');
      return { audioPath: outputPath, metadata: videoInfo };
      
    } catch (error) {
      console.error('Download error:', error.message);
      throw error;
    }
  }

  /**
   * Extract segments from video for analysis
   * @param {string} url - YouTube URL
   * @param {number} segmentDuration - Duration of each segment in seconds
   * @returns {Promise<Array>} Array of segment info
   */
  async extractSegments(url, segmentDuration = 30) {
    const videoInfo = await this.getVideoInfo(url);
    const segments = [];
    
    for (let start = 0; start < videoInfo.duration; start += segmentDuration) {
      segments.push({
        start: start,
        end: Math.min(start + segmentDuration, videoInfo.duration),
        duration: Math.min(segmentDuration, videoInfo.duration - start)
      });
    }
    
    return segments;
  }

  /**
   * Check if yt-dlp is available
   * @returns {Promise<boolean>} True if available
   */
  async checkYtDlpAvailability() {
    try {
      await execAsync('yt-dlp --version');
      return true;
    } catch (error) {
      console.error('yt-dlp not found. Please install: pip install yt-dlp');
      return false;
    }
  }

  /**
   * Clean up temporary files
   * @param {string} videoId - YouTube video ID
   */
  cleanupAudio(videoId) {
    const audioPath = path.join(this.tempDir, `${videoId}_audio.wav`);
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🧹 Cleaned up: ${audioPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not delete: ${error.message}`);
    }
  }
}

module.exports = YouTubeService;