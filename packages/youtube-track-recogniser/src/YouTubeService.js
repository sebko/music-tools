const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class YouTubeService {
  constructor(options = {}) {
    this.ytDlpWrap = new YTDlpWrap();
    this.tempDir = options.tempDir || process.env.AUDIO_TEMP_DIR || './temp';
    this.maxDuration = parseInt(options.maxDuration || process.env.MAX_AUDIO_LENGTH) || 3600;
    this.audioQuality = options.audioQuality || process.env.AUDIO_QUALITY || '128';
    
    // YouTube workaround options
    this.useCookies = options.useCookies !== false; // Default to true
    this.browser = options.browser || 'chrome'; // Default browser for cookies
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Download audio from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} Object containing audio path and video metadata
   */
  async downloadAudio(url) {
    try {
      // Get video info first
      const videoInfo = await this.getVideoInfo(url);
      console.log(`📹 Video: ${videoInfo.title} (${this.formatDuration(videoInfo.duration)})`);
      
      if (videoInfo.duration > this.maxDuration) {
        throw new Error(`Video too long: ${this.formatDuration(videoInfo.duration)}. Max allowed: ${this.formatDuration(this.maxDuration)}`);
      }

      const outputPath = path.join(this.tempDir, `${videoInfo.id}_audio.wav`);
      
      // Check if already downloaded
      if (fs.existsSync(outputPath)) {
        console.log('ℹ️  Audio already downloaded, using cached version');
        return { audioPath: outputPath, metadata: videoInfo };
      }

      console.log('📥 Downloading audio...');
      
      // Download audio with enhanced yt-dlp args
      const downloadArgs = [
        url,
        '-x', // Extract audio
        '--audio-format', 'wav',
        '--audio-quality', this.audioQuality,
        '-o', outputPath,
        '--no-playlist', // Don't download playlists
        '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best', // Prefer specific audio formats
        '--user-agent', this.userAgent,
        '--no-check-certificates',
        '--progress',
        '--newline'
      ];
      
      await new Promise((resolve, reject) => {
        const process = this.ytDlpWrap.exec(downloadArgs);

        let lastProgress = 0;
        
        process.on('progress', (progress) => {
          if (progress.percent && progress.percent - lastProgress > 5) {
            console.log(`  Download progress: ${progress.percent.toFixed(1)}%`);
            lastProgress = progress.percent;
          }
        });
        
        process.on('error', (error) => {
          reject(new Error(`Download failed: ${error.message}`));
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        });
      });

      console.log('✓ Audio downloaded successfully');
      return { audioPath: outputPath, metadata: videoInfo };
    } catch (error) {
      console.error('YouTube download error:', error.message);
      throw error;
    }
  }

  /**
   * Build yt-dlp arguments with workarounds
   * @param {Array} baseArgs - Base yt-dlp arguments
   * @returns {Array} Enhanced arguments
   */
  buildYtDlpArgs(baseArgs) {
    const args = [...baseArgs];
    
    // Add user agent
    args.push('--user-agent', this.userAgent);
    
    // Add workarounds for YouTube restrictions
    args.push(
      '--no-check-certificates',
      '--format', 'bestaudio/best'  // Prefer best audio format
    );
    
    // Try cookies only if not doing audio extraction to avoid conflicts
    const isAudioExtraction = baseArgs.includes('-x') || baseArgs.includes('--extract-audio');
    if (this.useCookies && !isAudioExtraction) {
      try {
        args.push('--cookies-from-browser', this.browser);
      } catch (error) {
        console.warn('Cookie authentication failed, continuing without cookies');
      }
    }
    
    return args;
  }

  /**
   * Get video information without downloading
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoInfo(url) {
    try {
      // Enhanced args with workarounds
      const baseArgs = [url, '--print', 'title', '--no-playlist'];
      const args = this.buildYtDlpArgs(baseArgs);
      
      const title = await this.ytDlpWrap.execPromise(args);
      
      // Get other metadata
      const duration = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'duration', '--no-playlist']));
      const id = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'id', '--no-playlist']));
      const uploader = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'uploader', '--no-playlist']));
      const description = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'description', '--no-playlist']));
      const upload_date = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'upload_date', '--no-playlist']));
      const view_count = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'view_count', '--no-playlist']));
      const channel = await this.ytDlpWrap.execPromise(this.buildYtDlpArgs([url, '--print', 'channel', '--no-playlist']));
      
      const info = {
        id: id.trim(),
        title: title.trim(),
        duration: parseInt(duration.trim()) || 0,
        uploader: uploader.trim(),
        description: description.trim(),
        upload_date: upload_date.trim(),
        view_count: parseInt(view_count.trim()) || 0,
        channel: channel.trim()
      };
      
      return {
        id: info.id,
        title: info.title,
        duration: info.duration,
        uploader: info.uploader,
        upload_date: info.upload_date,
        description: info.description,
        view_count: info.view_count,
        channel: info.channel,
        url: url
      };
    } catch (error) {
      console.error('Error getting video info:', error.message);
      throw error;
    }
  }

  /**
   * Check if the video is available and not geo-blocked
   * @param {string} url - YouTube URL
   * @returns {Promise<boolean>} True if video is accessible
   */
  async checkVideoAvailability(url) {
    try {
      await this.getVideoInfo(url);
      return true;
    } catch (error) {
      if (error.message.includes('Video unavailable') || 
          error.message.includes('Private video') ||
          error.message.includes('blocked')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Extract video ID from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {string|null} Video ID or null if not found
   */
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Validate YouTube URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid YouTube URL
   */
  isValidYouTubeUrl(url) {
    const videoId = this.extractVideoId(url);
    return videoId !== null && videoId.length === 11;
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
   * @returns {Promise<boolean>} True if yt-dlp is available
   */
  async checkYtDlpAvailability() {
    try {
      await execAsync('yt-dlp --version');
      return true;
    } catch (error) {
      console.error('yt-dlp not found. Please install yt-dlp to use YouTube processing features.');
      return false;
    }
  }

  /**
   * Clean up downloaded audio files
   * @param {string} videoId - YouTube video ID
   */
  cleanupAudio(videoId) {
    const audioPath = path.join(this.tempDir, `${videoId}_audio.wav`);
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🧹 Cleaned up audio: ${audioPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not delete audio file: ${error.message}`);
    }
  }
}

module.exports = YouTubeService;