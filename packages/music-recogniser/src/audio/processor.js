const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AudioProcessor {
  constructor(options = {}) {
    this.tempDir = options.tempDir || process.env.AUDIO_TEMP_DIR || './temp';
    this.segmentDuration = options.segmentDuration || 10; // 10 second segments for recognition
    this.overlapDuration = options.overlapDuration || 2; // 2 second overlap between segments
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get audio duration using ffprobe
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<number>} Duration in seconds
   */
  async getAudioDuration(audioPath) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
      );
      return parseFloat(stdout.trim());
    } catch (error) {
      console.error('Error getting audio duration:', error.message);
      throw error;
    }
  }

  /**
   * Extract audio segment using ffmpeg
   * @param {string} audioPath - Path to source audio file
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   * @returns {Promise<string>} Path to extracted segment
   */
  async extractSegment(audioPath, startTime, duration) {
    try {
      const outputPath = path.join(
        this.tempDir, 
        `segment_${Date.now()}_${startTime}-${startTime + duration}.wav`
      );

      // Use ffmpeg to extract segment
      const command = `ffmpeg -y -i "${audioPath}" -ss ${startTime} -t ${duration} -acodec pcm_s16le -ar 44100 -ac 1 "${outputPath}"`;
      
      await execAsync(command);
      
      return outputPath;
    } catch (error) {
      console.error('Error extracting audio segment:', error.message);
      throw error;
    }
  }

  /**
   * Create strategic samples from audio for single track recognition
   * @param {string} audioPath - Path to audio file
   * @param {Array} samplePoints - Array of percentage points to sample (0-1)
   * @param {number} segmentDuration - Duration of each sample in seconds
   * @returns {Promise<Array>} Array of segment objects
   */
  async createStrategicSamples(audioPath, samplePoints = [0.1, 0.3, 0.5, 0.7, 0.9], segmentDuration = 10) {
    try {
      // Get audio duration
      const duration = await this.getAudioDuration(audioPath);
      console.log(`🎵 Audio duration: ${this.formatDuration(duration)}`);
      
      const segments = [];
      
      for (const point of samplePoints) {
        // Calculate start time based on percentage
        const startTime = Math.max(0, (duration * point) - (segmentDuration / 2));
        // Ensure we don't go past the end
        const actualDuration = Math.min(segmentDuration, duration - startTime);
        
        if (actualDuration > 3) { // Only create segment if it's at least 3 seconds
          const segmentPath = await this.extractSegment(audioPath, startTime, actualDuration);
          
          segments.push({
            path: segmentPath,
            startTime: startTime,
            endTime: startTime + actualDuration,
            duration: actualDuration,
            samplePoint: point
          });
        }
      }
      
      console.log(`🔪 Created ${segments.length} strategic samples`);
      return segments;
    } catch (error) {
      console.error('Error creating strategic samples:', error.message);
      throw error;
    }
  }

  /**
   * Segment audio file into chunks for recognition
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Array>} Array of segment objects
   */
  async segmentAudio(audioPath) {
    try {
      // Get audio duration
      const duration = await this.getAudioDuration(audioPath);
      console.log(`🎵 Audio duration: ${this.formatDuration(duration)}`);
      
      const segments = [];
      let currentTime = 0;
      
      // Create segments with overlap
      while (currentTime < duration) {
        const segmentStart = currentTime;
        const segmentEnd = Math.min(currentTime + this.segmentDuration, duration);
        const segmentPath = await this.extractSegment(
          audioPath, 
          segmentStart, 
          segmentEnd - segmentStart
        );
        
        segments.push({
          path: segmentPath,
          startTime: segmentStart,
          endTime: segmentEnd,
          duration: segmentEnd - segmentStart
        });
        
        // Move to next segment with overlap
        currentTime += this.segmentDuration - this.overlapDuration;
      }
      
      console.log(`🔪 Created ${segments.length} segments`);
      return segments;
    } catch (error) {
      console.error('Error segmenting audio:', error.message);
      throw error;
    }
  }

  /**
   * Convert audio file to format suitable for recognition services
   * @param {string} audioPath - Path to source audio file
   * @param {Object} options - Conversion options
   * @returns {Promise<string>} Path to converted file
   */
  async convertAudio(audioPath, options = {}) {
    try {
      const {
        format = 'wav',
        sampleRate = 44100,
        channels = 1,
        bitRate = '128k'
      } = options;

      const outputPath = path.join(
        this.tempDir,
        `converted_${Date.now()}.${format}`
      );

      let command = `ffmpeg -y -i "${audioPath}"`;
      
      // Add audio processing parameters
      command += ` -acodec pcm_s16le -ar ${sampleRate} -ac ${channels}`;
      
      if (format === 'mp3') {
        command += ` -b:a ${bitRate}`;
      }
      
      command += ` "${outputPath}"`;
      
      await execAsync(command);
      
      return outputPath;
    } catch (error) {
      console.error('Error converting audio:', error.message);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   * @param {Array} filePaths - Array of file paths to delete
   */
  async cleanup(filePaths) {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Warning: Could not delete temp file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Format duration in seconds to human readable format
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
   * Check if ffmpeg is available
   * @returns {Promise<boolean>} True if ffmpeg is available
   */
  async checkFfmpegAvailability() {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      console.error('FFmpeg not found. Please install FFmpeg to use audio processing features.');
      return false;
    }
  }
}

module.exports = AudioProcessor;