const axios = require('axios');
const fs = require('fs');

class ShazamService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.RAPIDAPI_SHAZAM_KEY;
    this.host = options.host || process.env.RAPIDAPI_SHAZAM_HOST || 'shazam.p.rapidapi.com';
    this.baseUrl = `https://${this.host}`;
  }

  /**
   * Identify a track from audio file
   * @param {string|Buffer} audioData - Path to audio file or audio buffer
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyTrack(audioData) {
    try {
      let audioBuffer;
      
      // Handle both file paths and buffers
      if (typeof audioData === 'string') {
        // For Shazam, we need to limit file size
        const stats = fs.statSync(audioData);
        if (stats.size > 800000) { // 800KB limit for better quality
          console.log('  ⚠️  File too large for Shazam, skipping...');
          return null;
        }
        audioBuffer = fs.readFileSync(audioData);
      } else {
        audioBuffer = audioData;
      }

      // Shazam expects base64 encoded audio with text/plain content type
      const base64Audio = audioBuffer.toString('base64');
      
      const response = await axios.post(
        `${this.baseUrl}/songs/detect`,
        base64Audio,
        {
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.host,
            'Content-Type': 'text/plain'
          },
          timeout: 30000
        }
      );


      if (response.data && response.data.track) {
        const track = response.data.track;
        const album = track.sections?.[0]?.metadata?.find(m => m.title === 'Album')?.text || null;
        
        return {
          service: 'shazam',
          title: track.title,
          artist: track.subtitle,
          album: album,
          confidence: response.data.matches?.[0]?.frequencyskew 
            ? (1 - Math.abs(response.data.matches[0].frequencyskew)) 
            : 0.9,
          shazam_key: track.key,
          isrc: track.isrc,
          genres: track.genres?.primary,
          external_ids: {
            shazam: track.key
          },
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('Shazam API error:', error.message);
      if (error.response) {
        console.error('Shazam response status:', error.response.status);
        console.error('Shazam response data:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Search for tracks by text
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of search results
   */
  async searchTracks(query) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/search`,
        {
          params: {
            term: query,
            limit: 10
          },
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.host
          }
        }
      );

      if (response.data && response.data.tracks && response.data.tracks.hits) {
        return response.data.tracks.hits.map(hit => ({
          service: 'shazam',
          title: hit.track.title,
          artist: hit.track.subtitle,
          key: hit.track.key,
          raw: hit
        }));
      }

      return [];
    } catch (error) {
      console.error('Shazam search error:', error.message);
      return [];
    }
  }

  /**
   * Get track details by Shazam key
   * @param {string} key - Shazam track key
   * @returns {Promise<Object|null>} Track details or null
   */
  async getTrackDetails(key) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/tracks/details`,
        {
          params: { key },
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.host
          }
        }
      );

      if (response.data) {
        return {
          service: 'shazam',
          title: response.data.title,
          artist: response.data.subtitle,
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('Shazam track details error:', error.message);
      return null;
    }
  }

  /**
   * Check if service is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(this.apiKey && this.host);
  }
}

module.exports = ShazamService;