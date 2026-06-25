const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class AudDService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.AUDD_API_KEY;
    this.baseUrl = 'https://api.audd.io';
  }

  /**
   * Identify a track from audio file
   * @param {string|Buffer} audioData - Path to audio file or audio buffer
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyTrack(audioData) {
    try {
      const form = new FormData();
      form.append('api_token', this.apiKey);
      form.append('return', 'apple_music,spotify,deezer,napster');
      
      // Handle both file paths and buffers
      if (typeof audioData === 'string') {
        form.append('file', fs.createReadStream(audioData));
      } else {
        form.append('file', audioData, {
          filename: 'audio.wav',
          contentType: 'audio/wav'
        });
      }

      const response = await axios.post(
        `${this.baseUrl}/`,
        form,
        {
          headers: {
            ...form.getHeaders()
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.status === 'success' && response.data.result) {
        const result = response.data.result;
        return {
          service: 'audd',
          title: result.title,
          artist: result.artist,
          album: result.album,
          duration: result.duration,
          confidence: 0.8, // AudD doesn't provide confidence, so we use a default
          external_ids: {
            apple_music: result.apple_music,
            spotify: result.spotify,
            deezer: result.deezer,
            napster: result.napster
          },
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('AudD API error:', error.message);
      return null;
    }
  }

  /**
   * Identify track from URL
   * @param {string} url - URL to audio/video
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyFromUrl(url) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/`,
        {
          api_token: this.apiKey,
          url: url,
          return: 'apple_music,spotify,deezer,napster'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000 // URL processing takes longer
        }
      );

      if (response.data && response.data.status === 'success' && response.data.result) {
        const result = response.data.result;
        return {
          service: 'audd',
          title: result.title,
          artist: result.artist,
          album: result.album,
          duration: result.duration,
          confidence: 0.8,
          external_ids: {
            apple_music: result.apple_music,
            spotify: result.spotify,
            deezer: result.deezer,
            napster: result.napster
          },
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('AudD URL recognition error:', error.message);
      return null;
    }
  }

  /**
   * Find lyrics for a track
   * @param {string} artist - Artist name
   * @param {string} title - Track title
   * @returns {Promise<Object|null>} Lyrics data or null
   */
  async findLyrics(artist, title) {
    try {
      const response = await axios.post(
        'https://api.audd.io/findLyrics/',
        {
          api_token: this.apiKey,
          artist: artist,
          title: title
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.status === 'success' && response.data.result) {
        return {
          service: 'audd',
          lyrics: response.data.result.lyrics,
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('AudD lyrics error:', error.message);
      return null;
    }
  }

  /**
   * Get account usage information
   * @returns {Promise<Object|null>} Usage data or null
   */
  async getUsage() {
    try {
      const response = await axios.post(
        'https://api.audd.io/usage/',
        {
          api_token: this.apiKey
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          service: 'audd',
          daily_limit: response.data.daily_limit,
          daily_usage: response.data.daily_usage,
          monthly_limit: response.data.monthly_limit,
          monthly_usage: response.data.monthly_usage,
          raw: response.data
        };
      }

      return null;
    } catch (error) {
      console.error('AudD usage error:', error.message);
      return null;
    }
  }

  /**
   * Check if service is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = AudDService;