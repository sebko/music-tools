/**
 * @fileoverview YouTube Track Recogniser Package
 * YouTube single track recognition using audio fingerprinting and comment analysis
 * 
 * NOTE: This package is designed for SINGLE TRACK recognition only.
 * For DJ mixes, live sets, or multi-track content, use @dj-tools/youtube-tracklist instead.
 */

// Load environment variables from root (shared) and package (if any)
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const YouTubeTrackRecogniser = require('./YouTubeTrackRecogniser');
const YouTubeService = require('./YouTubeService');

/**
 * Create a new YouTubeTrackRecogniser instance
 * @param {Object} options - Configuration options
 * @returns {YouTubeTrackRecogniser} Configured recogniser instance
 */
function createRecogniser(options = {}) {
  return new YouTubeTrackRecogniser(options);
}

/**
 * Quick identification function for YouTube URLs (audio only)
 * @param {string} url - YouTube URL
 * @param {Object} options - Recognition options
 * @returns {Promise<Object|null>} Recognition result
 */
async function identify(url, options = {}) {
  const recogniser = new YouTubeTrackRecogniser(options);
  return await recogniser.identify(url);
}

/**
 * Hybrid identification using both audio and comments (recommended for single tracks)
 * @param {string} url - YouTube URL
 * @param {Object} options - Recognition options
 * @returns {Promise<Object>} Enhanced recognition result
 */
async function identifyHybrid(url, options = {}) {
  const recogniser = new YouTubeTrackRecogniser(options);
  return await recogniser.identifyHybrid(url);
}

/**
 * Identification from comments only
 * @param {string} url - YouTube URL
 * @param {Object} options - Recognition options
 * @returns {Promise<Object|null>} Recognition result from comments
 */
async function identifyFromComments(url, options = {}) {
  const recogniser = new YouTubeTrackRecogniser(options);
  return await recogniser.identifyFromComments(url);
}

/**
 * Test intensity modes on a YouTube URL
 * @param {string} url - YouTube URL
 * @param {Array} modes - Modes to test (default: ['quick', 'ham', 'ultra'])
 * @param {Object} options - Base options
 * @returns {Promise<Object>} Results from all modes
 */
async function testModes(url, modes = ['quick', 'ham', 'ultra'], options = {}) {
  const recogniser = new YouTubeTrackRecogniser(options);
  return await recogniser.testIntensityModes(url, modes);
}

/**
 * Get YouTube video information without recognition
 * @param {string} url - YouTube URL
 * @param {Object} options - YouTube service options
 * @returns {Promise<Object>} Video metadata
 */
async function getVideoInfo(url, options = {}) {
  const youtubeService = new YouTubeService(options);
  return await youtubeService.getVideoInfo(url);
}

/**
 * Check if a YouTube URL is valid and accessible
 * @param {string} url - YouTube URL
 * @returns {boolean} True if valid YouTube URL format
 */
function isValidYouTubeUrl(url) {
  const youtubeService = new YouTubeService();
  return youtubeService.isValidYouTubeUrl(url);
}

module.exports = {
  // Main classes
  YouTubeTrackRecogniser,
  YouTubeService,
  
  // Convenience functions
  createRecogniser,
  identify,
  identifyHybrid,
  identifyFromComments,
  testModes,
  getVideoInfo,
  isValidYouTubeUrl,
  
  // Default export
  default: YouTubeTrackRecogniser
};