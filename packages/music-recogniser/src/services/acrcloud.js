const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

class ACRCloudService {
  constructor(options = {}) {
    this.host = options.host || process.env.ACRCLOUD_HOST;
    this.accessKey = options.accessKey || process.env.ACRCLOUD_ACCESS_KEY;
    this.accessSecret = options.accessSecret || process.env.ACRCLOUD_ACCESS_SECRET;
    this.requrl = `https://${this.host}/v1/identify`;
  }

  /**
   * Generate ACRCloud signature
   * @param {string} method - HTTP method
   * @param {string} uri - Request URI
   * @param {string} accessKey - Access key
   * @param {string} dataType - Data type
   * @param {string} signatureVersion - Signature version
   * @param {string} timestamp - Timestamp
   * @returns {string} Generated signature
   */
  generateSignature(method, uri, accessKey, dataType, signatureVersion, timestamp) {
    const stringToSign = [method, uri, accessKey, dataType, signatureVersion, timestamp].join('\n');
    return CryptoJS.HmacSHA1(stringToSign, this.accessSecret).toString(CryptoJS.enc.Base64);
  }

  /**
   * Identify a track from audio file
   * @param {string|Buffer} audioData - Path to audio file or audio buffer
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyTrack(audioData) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.generateSignature('POST', '/v1/identify', this.accessKey, 'audio', '1', timestamp);
      
      const form = new FormData();
      form.append('access_key', this.accessKey);
      form.append('data_type', 'audio');
      form.append('signature_version', '1');
      form.append('signature', signature);
      form.append('timestamp', timestamp);
      
      // Handle both file paths and buffers
      if (typeof audioData === 'string') {
        form.append('sample', fs.createReadStream(audioData));
        form.append('sample_bytes', fs.statSync(audioData).size.toString());
      } else {
        form.append('sample', audioData, {
          filename: 'audio.wav',
          contentType: 'audio/wav'
        });
        form.append('sample_bytes', audioData.length.toString());
      }

      const response = await axios.post(
        this.requrl,
        form,
        {
          headers: {
            ...form.getHeaders()
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.status && response.data.status.code === 0) {
        const metadata = response.data.metadata;
        if (metadata && metadata.music && metadata.music.length > 0) {
          const track = metadata.music[0];
          return {
            service: 'acrcloud',
            title: track.title,
            artist: track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown',
            album: track.album ? track.album.name : null,
            duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
            confidence: track.score / 100, // ACRCloud provides score out of 100
            release_date: track.release_date,
            genres: track.genres ? track.genres.map(g => g.name) : [],
            label: track.label,
            external_ids: track.external_ids || {},
            raw: response.data
          };
        }
      }

      return null;
    } catch (error) {
      console.error('ACRCloud API error:', error.message);
      return null;
    }
  }

  /**
   * Identify track from fingerprint
   * @param {string} fingerprint - Audio fingerprint
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyFromFingerprint(fingerprint) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.generateSignature('POST', '/v1/identify', this.accessKey, 'fingerprint', '1', timestamp);
      
      const form = new FormData();
      form.append('access_key', this.accessKey);
      form.append('data_type', 'fingerprint');
      form.append('signature_version', '1');
      form.append('signature', signature);
      form.append('timestamp', timestamp);
      form.append('sample', fingerprint);

      const response = await axios.post(
        this.requrl,
        form,
        {
          headers: {
            ...form.getHeaders()
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.status && response.data.status.code === 0) {
        const metadata = response.data.metadata;
        if (metadata && metadata.music && metadata.music.length > 0) {
          const track = metadata.music[0];
          return {
            service: 'acrcloud',
            title: track.title,
            artist: track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown',
            album: track.album ? track.album.name : null,
            duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
            confidence: track.score / 100,
            release_date: track.release_date,
            genres: track.genres ? track.genres.map(g => g.name) : [],
            label: track.label,
            external_ids: track.external_ids || {},
            raw: response.data
          };
        }
      }

      return null;
    } catch (error) {
      console.error('ACRCloud fingerprint error:', error.message);
      return null;
    }
  }

  /**
   * Get humming recognition (if supported by your plan)
   * @param {string|Buffer} audioData - Path to audio file or audio buffer
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identifyHumming(audioData) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.generateSignature('POST', '/v1/identify', this.accessKey, 'humming', '1', timestamp);
      
      const form = new FormData();
      form.append('access_key', this.accessKey);
      form.append('data_type', 'humming');
      form.append('signature_version', '1');
      form.append('signature', signature);
      form.append('timestamp', timestamp);
      
      // Handle both file paths and buffers
      if (typeof audioData === 'string') {
        form.append('sample', fs.createReadStream(audioData));
        form.append('sample_bytes', fs.statSync(audioData).size.toString());
      } else {
        form.append('sample', audioData, {
          filename: 'audio.wav',
          contentType: 'audio/wav'
        });
        form.append('sample_bytes', audioData.length.toString());
      }

      const response = await axios.post(
        this.requrl,
        form,
        {
          headers: {
            ...form.getHeaders()
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.status && response.data.status.code === 0) {
        const metadata = response.data.metadata;
        if (metadata && metadata.humming && metadata.humming.length > 0) {
          const track = metadata.humming[0];
          return {
            service: 'acrcloud',
            title: track.title,
            artist: track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown',
            album: track.album ? track.album.name : null,
            duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
            confidence: track.score / 100,
            raw: response.data
          };
        }
      }

      return null;
    } catch (error) {
      console.error('ACRCloud humming error:', error.message);
      return null;
    }
  }

  /**
   * Check if service is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(this.host && this.accessKey && this.accessSecret);
  }
}

module.exports = ACRCloudService;